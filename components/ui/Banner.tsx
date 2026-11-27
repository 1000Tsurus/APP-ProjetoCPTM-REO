import { StyleSheet, Text, View } from 'react-native';

import { COLOR, FONT_SIZE } from '@/constants/theme';
import { Button } from './Button';

type Props = { tone: 'warn' | 'info'; text: string; action?: { title: string; onPress: () => void } };

const TONES = {
  warn: { bg: COLOR.amberTint, border: COLOR.amberLine, fg: COLOR.amber },
  info: { bg: COLOR.blueTint, border: COLOR.blue, fg: COLOR.blue },
} as const;

/** Faixa de aviso (offline, pendências), com ação opcional; no padrão da faixa de demonstração do site. */
export function Banner({ tone, text, action }: Props) {
  const c = TONES[tone];
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.text, { color: c.fg }]}>{text}</Text>
      {action ? <Button title={action.title} onPress={action.onPress} variant="ghost" small /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  text: { flex: 1, fontSize: FONT_SIZE.small, lineHeight: 20 },
});
