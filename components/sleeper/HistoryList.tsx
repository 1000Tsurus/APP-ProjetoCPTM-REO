import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COLOR, FONT_SIZE } from '@/constants/theme';
import type { HistoryEntry } from '@/data/api/types';
import { INSPECTION_RESULT, label, MOVEMENT_KIND, OCCURRENCE_KIND } from '@/data/labels';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<HistoryEntry['type'], IconName> = {
  movement: 'swap-horizontal-outline',
  inspection: 'clipboard-outline',
  occurrence: 'warning-outline',
};

/** Resumo de uma linha do evento, com os rótulos em português. */
export function summarize(e: HistoryEntry): string {
  if (e.type === 'movement') return label(MOVEMENT_KIND, e.movement?.kind) || 'Movimentação';
  if (e.type === 'inspection') {
    const result = label(INSPECTION_RESULT, e.inspection?.result);
    return result ? `Inspeção — ${result}` : 'Inspeção';
  }
  const kind = label(OCCURRENCE_KIND, e.occurrence?.kind);
  return kind ? `Ocorrência — ${kind}` : 'Ocorrência';
}

/** Histórico cronológico do dormente (a API já entrega ordenado); data no fuso local. */
export function HistoryList({ items }: { items: HistoryEntry[] }) {
  return (
    <View>
      {items.map((e, i) => (
        <View key={`${e.type}-${e.occurred_at}-${i}`} style={styles.row}>
          <Ionicons name={ICONS[e.type] ?? 'ellipse-outline'} size={20} color={COLOR.textDim} />
          <View style={styles.body}>
            <Text style={styles.summary}>{summarize(e)}</Text>
            <Text style={styles.date}>{new Date(e.occurred_at).toLocaleString('pt-BR')}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLOR.line },
  body: { flex: 1 },
  summary: { fontSize: FONT_SIZE.base, color: COLOR.text },
  date: { fontSize: FONT_SIZE.caption, color: COLOR.textFaint },
});
