import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Field } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, MIN_TOUCH, RADIUS } from '@/constants/theme';
import type { SleeperRead } from '@/data/api/types';
import { speciesLabel } from '@/data/labels';
import { searchSleepers } from '@/data/manual-search';

const MIN_QUERY = 4;

type Props = { onRead: (tag: string) => void };

/** Rota manual: busca por tag/ata com sugestões (a partir de 4 caracteres); Enter lê o texto como está. */
export function TagSearchField({ onRead }: Props) {
  const [text, setText] = useState('');
  const [items, setItems] = useState<SleeperRead[]>([]);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
  }, []);

  useEffect(() => {
    const q = text.trim();
    if (q.length < MIN_QUERY) {
      setItems([]);
      return;
    }
    let alive = true;
    // Espera o operador parar de digitar antes de consultar.
    const timer = setTimeout(() => {
      searchSleepers(q)
        .then((r) => {
          if (alive) setItems(r.items);
        })
        .catch(() => {
          if (alive) setItems([]);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [text]);

  function submit(tag: string) {
    if (!tag.trim()) return;
    onRead(tag);
    setText('');
    setItems([]);
    // Devolve o foco: o operador segue lendo/digitando sem tocar no campo.
    focusTimer.current = setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <View style={styles.wrap}>
      <Field
        ref={inputRef}
        label="Buscar ou digitar tag"
        mono
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => submit(text)}
        submitBehavior="submit"
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="done"
      />
      {items.map((s) => (
        <Pressable key={s.id} accessibilityRole="button" onPress={() => submit(s.rfid_tag)} style={styles.suggestion}>
          <Text style={[styles.tag, { fontFamily: FONT_CODE }]}>{s.rfid_tag}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[speciesLabel(s.species), s.registration_record].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  suggestion: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: COLOR.panel,
    borderWidth: 1,
    borderColor: COLOR.line,
    borderRadius: RADIUS.field,
  },
  tag: { fontSize: FONT_SIZE.base, color: COLOR.text },
  sub: { fontSize: FONT_SIZE.caption, color: COLOR.textDim },
});
