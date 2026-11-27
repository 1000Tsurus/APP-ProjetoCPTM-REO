import { StyleSheet, Text, View } from 'react-native';

import { COLOR, FONT_SIZE } from '@/constants/theme';

type Counts = { read: number; sent: number; queued: number; rejected: number };

/** Rodapé fixo com os totais do lote. */
export function BatchFooter({ counts }: { counts: Counts }) {
  const rejected = counts.rejected > 0 ? ` · ${counts.rejected} rejeitados` : '';
  return (
    <View style={styles.footer}>
      <Text style={styles.text}>{`${counts.read} lidos · ${counts.sent} enviados · ${counts.queued} na fila${rejected}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { padding: 12, backgroundColor: COLOR.panel, borderTopWidth: 1, borderTopColor: COLOR.line },
  text: { fontSize: FONT_SIZE.base, fontWeight: '600', color: COLOR.text, textAlign: 'center' },
});
