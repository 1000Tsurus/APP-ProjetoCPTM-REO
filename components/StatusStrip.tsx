import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLOR, FONT_SIZE, MIN_TOUCH } from '@/constants/theme';
import { useReader } from '@/contexts/ReaderContext';
import { useReaderStatus } from '@/contexts/useReaderStatus';
import { useSession } from '@/contexts/SessionContext';
import { syncStatusText } from '@/data/status-text';
import { useSync } from '@/data/use-sync';

/** Bordas da tela abaixo da faixa: o recuo do topo já foi consumido pela faixa. */
export const EDGES_BELOW_STRIP: ('left' | 'right' | 'bottom')[] = ['left', 'right', 'bottom'];

const TONE = {
  ok: { bg: COLOR.greenTint, fg: COLOR.green },
  warn: { bg: COLOR.amberTint, fg: COLOR.amber },
  error: { bg: COLOR.redTint, fg: COLOR.red },
} as const;

/** Faixa fina no topo: leitor à esquerda (toque reconecta), envio à direita (toque abre a Fila). */
export function StatusStrip() {
  const router = useRouter();
  const reader = useReader();
  const { offline } = useSession();
  const { pending, rejected, syncing, lastOkAt } = useSync();
  const { status: readerStatus, text: readerText } = useReaderStatus();

  const sync = syncStatusText({ pending, rejected, offline, syncing, lastOkAt, now: new Date() });
  const tone = TONE[sync.tone];

  return (
    <View style={styles.strip}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Leitor de tags"
        onPress={() => void reader.reconnect()}
        style={styles.left}
      >
        <Text style={[styles.text, readerStatus === 'disconnected' ? { color: COLOR.amber } : null]} numberOfLines={1}>
          {readerText}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fila de envio"
        onPress={() => router.push('/fila')}
        style={[styles.right, { backgroundColor: tone.bg }]}
      >
        <Text style={[styles.text, { color: tone.fg, fontWeight: '600' }]} numberOfLines={1}>
          {sync.text}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH - 8,
    backgroundColor: COLOR.panel,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.line,
  },
  left: { justifyContent: 'center', paddingHorizontal: 16, flexShrink: 1 },
  right: { justifyContent: 'center', paddingHorizontal: 16, flexShrink: 1 },
  text: { fontSize: FONT_SIZE.small, color: COLOR.textDim },
});
