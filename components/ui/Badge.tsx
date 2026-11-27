import { StyleSheet, Text, View } from 'react-native';

import { COLOR, FONT_SIZE, type Tone } from '@/constants/theme';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: COLOR.greenTint, fg: COLOR.green },
  info: { bg: COLOR.blueTint, fg: COLOR.blue },
  warn: { bg: COLOR.amberTint, fg: COLOR.amber },
  danger: { bg: COLOR.redTint, fg: COLOR.red },
  neutro: { bg: COLOR.panelAlt, fg: COLOR.textDim },
};

/** Selo arredondado com tom (status, resultado). Tom desconhecido cai em neutro. */
export function Badge({ text, tone }: { text: string; tone: Tone }) {
  const c = TONES[tone] ?? TONES.neutro;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  text: { fontSize: FONT_SIZE.caption, fontWeight: '500' },
});
