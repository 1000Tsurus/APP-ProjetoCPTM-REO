import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { COLOR, FONT_SIZE } from '@/constants/theme';

/** Rótulo pequeno acima de campos e métricas. */
export function Label({ children, color }: { children: ReactNode; color?: string }) {
  return <Text style={[styles.label, color ? { color } : null]}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { fontSize: FONT_SIZE.caption, fontWeight: '500', color: COLOR.textDim },
});
