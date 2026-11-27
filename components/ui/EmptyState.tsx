import { StyleSheet, Text } from 'react-native';

import { COLOR, FONT_SIZE } from '@/constants/theme';

/** Mensagem cinza mostrada quando uma lista ainda não tem nada. */
export function EmptyState({ text }: { text: string }) {
  return <Text style={styles.text}>{text}</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: FONT_SIZE.small, color: COLOR.textFaint, paddingVertical: 18, paddingHorizontal: 4 },
});
