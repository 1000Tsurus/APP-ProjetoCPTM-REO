import { Image, StyleSheet, Text, View } from 'react-native';

import { COLOR, FONT_SIZE, RADIUS } from '@/constants/theme';

/** Logotipo da CPTM + nome do sistema. `onDark`: logo num cartão branco e texto branco (fundo vermelho). */
export function BrandHeader({ onDark = false }: { onDark?: boolean }) {
  const logo = (
    <Image
      source={require('@/assets/images/logo-cptm.png')}
      style={styles.logo}
      resizeMode="contain"
      accessibilityLabel="CPTM"
    />
  );
  return (
    <View style={styles.row}>
      {onDark ? <View style={styles.card}>{logo}</View> : logo}
      <View style={[styles.divider, { borderLeftColor: onDark ? 'rgba(255,255,255,0.4)' : COLOR.line }]}>
        <Text style={[styles.name, { color: onDark ? '#FFFFFF' : COLOR.text }]}>Armazém</Text>
        <Text style={[styles.sub, { color: onDark ? '#FFFFFF' : COLOR.textDim }]}>Monitoramento logístico</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { height: 30, width: 90 },
  card: { backgroundColor: '#FFFFFF', borderRadius: RADIUS.panel, paddingHorizontal: 10, paddingVertical: 6 },
  divider: { borderLeftWidth: 1, paddingLeft: 12 },
  name: { fontSize: FONT_SIZE.small, fontWeight: '700', lineHeight: 17 },
  sub: { fontSize: FONT_SIZE.caption },
});
