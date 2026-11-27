import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COLOR, FONT_SIZE, MIN_TOUCH, RADIUS } from '@/constants/theme';
import { Label } from './Label';

export type PickerOption = { id: string; label: string };

type Props = {
  label: string;
  options: PickerOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** Permite voltar a "nenhum" (campos opcionais). */
  clearable?: boolean;
  /** Mensagem de erro; também pinta a borda de vermelho. */
  error?: string | null;
  emptyText?: string;
};

/** Seletor simples: botão que expande uma lista de opções (sem dependência extra). */
export function OptionPicker({ label, options, value, onChange, placeholder = 'Selecionar', clearable, error, emptyText }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <View style={styles.wrap}>
      <Label>{label}</Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={[styles.box, error ? styles.boxError : null]}
      >
        <Text style={[styles.value, !selected ? styles.placeholder : null]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLOR.textDim} />
      </Pressable>
      {open ? (
        <View style={styles.list}>
          <ScrollView nestedScrollEnabled style={styles.scroll} keyboardShouldPersistTaps="handled">
            {clearable ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
                style={styles.row}
              >
                <Text style={[styles.rowText, styles.placeholder]}>Nenhum</Text>
              </Pressable>
            ) : null}
            {options.length === 0 ? <Text style={styles.empty}>{emptyText ?? 'Nenhuma opção disponível.'}</Text> : null}
            {options.map((o) => (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                accessibilityState={{ selected: o.id === value }}
                onPress={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                style={[styles.row, o.id === value ? styles.rowSelected : null]}
              >
                <Text style={styles.rowText}>{o.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: COLOR.panelAlt,
    borderWidth: 1,
    borderColor: COLOR.line,
    borderRadius: RADIUS.field,
  },
  boxError: { borderColor: COLOR.red },
  value: { flex: 1, fontSize: FONT_SIZE.base, color: COLOR.text },
  placeholder: { color: COLOR.textFaint },
  list: { borderWidth: 1, borderColor: COLOR.line, borderRadius: RADIUS.field, backgroundColor: COLOR.panel },
  scroll: { maxHeight: 240 },
  row: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLOR.line },
  rowSelected: { backgroundColor: COLOR.blueTint },
  rowText: { fontSize: FONT_SIZE.base, color: COLOR.text },
  empty: { padding: 12, fontSize: FONT_SIZE.small, color: COLOR.textFaint },
  error: { fontSize: FONT_SIZE.caption, color: COLOR.red },
});
