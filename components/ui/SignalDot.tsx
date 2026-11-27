import { StyleSheet, View } from 'react-native';

import { COLOR } from '@/constants/theme';

/** Bolinha de status: verde = ok, âmbar = aviso, qualquer outro valor = vermelho. */
export function SignalDot({ status }: { status: 'ok' | 'warn' | 'error' }) {
  const color = status === 'ok' ? COLOR.green : status === 'warn' ? COLOR.amber : COLOR.red;
  return <View accessibilityElementsHidden style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 99 },
});
