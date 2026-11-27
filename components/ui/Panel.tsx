import type { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { COLOR, RADIUS } from '@/constants/theme';

type Props = { accent?: string; style?: StyleProp<ViewStyle>; children?: ReactNode };

/** Cartão branco com borda; `accent` pinta uma borda grossa à esquerda (estado do cartão). */
export function Panel({ accent, style, children }: Props) {
  return (
    <View style={[styles.panel, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: COLOR.panel,
    borderWidth: 1,
    borderColor: COLOR.line,
    borderRadius: RADIUS.panel,
    padding: 16,
  },
});
