import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLOR, FONT_SIZE, MIN_TOUCH, RADIUS } from '@/constants/theme';
import { Label } from './Label';

type Props<T extends string> = {
  label: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (id: T) => void;
};

/** Escolha única com poucas opções visíveis de uma vez (tipo, conservação, umidade, resultado). */
export function ChoiceRow<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <View style={styles.wrap}>
      <Label>{label}</Label>
      <View style={styles.row}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.id)}
              style={[styles.chip, on ? styles.chipOn : null]}
            >
              <Text style={[styles.text, on ? styles.textOn : null]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: COLOR.panelAlt,
    borderWidth: 1,
    borderColor: COLOR.line,
    borderRadius: RADIUS.field,
  },
  chipOn: { backgroundColor: COLOR.blueTint, borderColor: COLOR.blue },
  text: { fontSize: FONT_SIZE.base, color: COLOR.text },
  textOn: { color: COLOR.blue, fontWeight: '600' },
});
