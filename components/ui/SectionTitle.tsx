import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COLOR, FONT_SIZE } from '@/constants/theme';

type Props = { icon: ComponentProps<typeof Ionicons>['name']; title: string; sub?: string };

/** Título com ícone vermelho que abre cada bloco de um Panel; `sub` é o apoio em cinza. */
export function SectionTitle({ icon, title, sub }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Ionicons name={icon} size={18} color={COLOR.red} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: FONT_SIZE.base, fontWeight: '600', color: COLOR.text },
  sub: { fontSize: FONT_SIZE.caption, color: COLOR.textFaint, marginTop: 3, marginLeft: 26 },
});
