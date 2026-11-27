import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { COLOR, FONT_SIZE, MIN_TOUCH, RADIUS } from '@/constants/theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'subtle';
  small?: boolean;
  /** Botão grande para as tarefas do Início (luva, uso em pé). */
  large?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
};

const VARIANTS = {
  primary: { bg: COLOR.red, fg: '#FFFFFF', border: COLOR.red },
  ghost: { bg: 'transparent', fg: COLOR.text, border: COLOR.line },
  subtle: { bg: COLOR.panelAlt, fg: COLOR.textDim, border: COLOR.line },
} as const;

/** Botão nas 3 variantes do site; altura mínima de toque e opacidade 0.5 quando desabilitado. */
export function Button({ title, onPress, variant = 'primary', small, large, disabled, icon }: Props) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border },
        small ? styles.small : null,
        large ? styles.large : null,
        disabled ? styles.disabled : pressed ? styles.pressed : null,
      ]}
    >
      {icon ? <Ionicons name={icon} size={large ? 26 : 18} color={v.fg} /> : null}
      <Text style={[styles.text, { color: v.fg }, small ? styles.textSmall : null, large ? styles.textLarge : null]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: RADIUS.field,
  },
  small: { paddingHorizontal: 12 },
  text: { fontSize: FONT_SIZE.base, fontWeight: '600' },
  large: { minHeight: 88 },
  textLarge: { fontSize: 20 },
  textSmall: { fontSize: FONT_SIZE.small },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
