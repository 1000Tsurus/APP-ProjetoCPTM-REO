import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, RADIUS, SPACE } from '@/constants/theme';
import type { ReadTone } from '@/data/batch';
import type { BatchRead } from '@/data/batch-session';

/** Cores por resultado: verde registrado, amarelo novo/aviso, azul aguardando conferência, vermelho erro. */
export const READ_TONE: Record<ReadTone, { bg: string; fg: string; line: string; label: string }> = {
  ok: { bg: COLOR.greenTint, fg: COLOR.green, line: COLOR.greenLine, label: 'Registrado' },
  new: { bg: COLOR.amberTint, fg: COLOR.amber, line: COLOR.amberLine, label: 'Novo' },
  warn: { bg: COLOR.amberTint, fg: COLOR.amber, line: COLOR.amberLine, label: 'Aviso' },
  pending: { bg: COLOR.blueTint, fg: COLOR.blue, line: COLOR.blue, label: 'Confere no envio' },
  error: { bg: COLOR.redTint, fg: COLOR.red, line: COLOR.red, label: 'Não registrado' },
};

type Props = { read: BatchRead; canUndo: boolean; undoNote: string | null; onUndo: () => void };

/** Cartão grande da última leitura; "Desfazer" só aparece enquanto a leitura ainda pode ser desfeita. */
export function ReadCard({ read, canUndo, undoNote, onUndo }: Props) {
  const t = READ_TONE[read.tone];
  return (
    <View style={[styles.card, { backgroundColor: t.bg, borderColor: t.line }]}>
      <Text style={[styles.status, { color: t.fg }]}>{read.undone ? 'Desfeito' : t.label}</Text>
      <Text style={[styles.tag, { fontFamily: FONT_CODE }]}>{read.tag}</Text>
      <Text style={styles.message}>{read.message}</Text>
      {canUndo && !read.undone ? <Button title="Desfazer" icon="arrow-undo" variant="ghost" onPress={onUndo} /> : null}
      {undoNote ? <Text style={[styles.note, { color: t.fg }]}>{undoNote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: RADIUS.panel, padding: SPACE.lg, gap: SPACE.sm },
  status: { fontSize: FONT_SIZE.base, fontWeight: '700' },
  tag: { fontSize: 20, fontWeight: '600', color: COLOR.text },
  message: { fontSize: FONT_SIZE.base, color: COLOR.text },
  note: { fontSize: FONT_SIZE.small },
});
