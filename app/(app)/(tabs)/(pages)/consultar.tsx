import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EDGES_BELOW_STRIP } from '@/components/StatusStrip';
import { TagSearchField } from '@/components/batch/TagSearchField';
import { Panel } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, MIN_TOUCH, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import { listIncomplete, type IncompleteEntry } from '@/data/incomplete';
import { isValidTag, normalizeTag } from '@/data/tag';

/** Consultar: busca a tag (digitada, lida ou sugerida) e lista os cadastros ainda sem plaqueta. */
export default function ConsultScreen() {
  const router = useRouter();
  const { user } = useSession();
  const userId = user?.id;
  const [incomplete, setIncomplete] = useState<IncompleteEntry[]>([]);
  const [open, setOpen] = useState(false);

  // A lista muda fora desta tela (cadastro no lote, plaqueta salva): relê ao voltar o foco.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let alive = true;
      listIncomplete(userId)
        .then((list) => {
          if (alive) setIncomplete(list);
        })
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, [userId]),
  );

  function openSleeper(raw: string) {
    const tag = normalizeTag(raw);
    if (!isValidTag(tag)) return;
    router.push(`/dormente/${encodeURIComponent(tag)}` as Href);
  }

  return (
    <SafeAreaView edges={EDGES_BELOW_STRIP} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TagSearchField onRead={openSleeper} />
        {incomplete.length > 0 ? (
          <Panel style={styles.panel}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setOpen((v) => !v)}
              style={styles.header}
            >
              <Text style={styles.headerText}>Cadastros sem plaqueta ({incomplete.length})</Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={COLOR.textDim} />
            </Pressable>
            {open
              ? incomplete.map((e) => (
                  <Pressable
                    key={e.tag}
                    accessibilityRole="button"
                    onPress={() => router.push(`/plaqueta/${encodeURIComponent(e.tag)}` as Href)}
                    style={styles.item}
                  >
                    <Text style={[styles.tag, { fontFamily: FONT_CODE }]}>{e.tag}</Text>
                    <View>
                      <Ionicons name="chevron-forward" size={18} color={COLOR.textFaint} />
                    </View>
                  </Pressable>
                ))
              : null}
          </Panel>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.lg, gap: SPACE.md },
  panel: { gap: SPACE.xs },
  header: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { fontSize: FONT_SIZE.base, fontWeight: '600', color: COLOR.text },
  item: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLOR.line,
  },
  tag: { fontSize: FONT_SIZE.base, color: COLOR.text },
});
