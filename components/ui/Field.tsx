import { type ComponentRef, type Ref, useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';

import { COLOR, FONT_CODE, FONT_SIZE, MIN_TOUCH, RADIUS } from '@/constants/theme';
import { Label } from './Label';

export type FieldProps = TextInputProps & { label: string; mono?: boolean; ref?: Ref<ComponentRef<typeof TextInput>> };

/** Estilo base de campo de texto, compartilhado com PasswordInput. */
export const fieldInputStyle = {
  minHeight: MIN_TOUCH,
  backgroundColor: COLOR.panelAlt,
  borderWidth: 1,
  borderColor: COLOR.line,
  borderRadius: RADIUS.field,
  paddingHorizontal: 12,
  color: COLOR.text,
  fontSize: FONT_SIZE.base,
} as const;

/** Campo de texto com rótulo; borda vermelha no foco e altura mínima de toque. `mono` para códigos (tag, matrícula). */
export function Field({ label, mono, style, onFocus, onBlur, ref, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Label>{label}</Label>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={COLOR.textFaint}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, mono ? { fontFamily: FONT_CODE } : null, focused ? styles.focused : null, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: fieldInputStyle,
  focused: { borderColor: COLOR.red },
});
