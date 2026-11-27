import { useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, SPACE } from '@/constants/theme';
import { useReader } from '@/contexts/ReaderContext';
import type { BatchTask } from '@/data/batch';
import { isValidTag, normalizeTag } from '@/data/tag';
import { BatchFooter } from './BatchFooter';
import { READ_TONE, ReadCard } from './ReadCard';
import { TagSearchField } from './TagSearchField';
import { taskTitle } from './task-title';
import { useBatchRun } from './useBatchRun';

type Props = { task: BatchTask; userId: string; onDone: () => void };

/** Leitura contínua: tarefa e "Concluir" no topo, último cartão, busca manual, lista dos lidos e totais. */
export function BatchReading({ task, userId, onDone }: Props) {
  const reader = useReader();
  const run = useBatchRun(task, userId);
  // Com o leitor por teclado, o campo de texto passa pelo leitor: um só caminho para as duas rotas.
  // Tag inválida o leitor descarta em silêncio; vai direto à sessão para mostrar o cartão de erro.
  const submitTag = (tag: string) =>
    reader.push && isValidTag(normalizeTag(tag)) ? reader.push(tag) : run.handleTag(tag);
  const done = useRef(false);
  const listed = [...run.reads].reverse();

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {taskTitle(task)}
        </Text>
        <Button
          title="Concluir"
          icon="checkmark"
          small
          onPress={() => {
            if (done.current) return;
            done.current = true;
            void run.finish().then(onDone);
          }}
        />
      </View>
      <View style={styles.top}>
        {run.card ? (
          <ReadCard read={run.card} canUndo={run.undoOpen} undoNote={run.undoNote} onUndo={() => void run.undoCard()} />
        ) : (
          <EmptyState text="Aproxime o leitor de uma tag ou digite abaixo." />
        )}
        <TagSearchField onRead={submitTag} autoFocus />
      </View>
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        data={listed}
        keyExtractor={(r) => `${r.at}-${r.tag}`}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={[styles.rowTag, { fontFamily: FONT_CODE }, item.undone ? styles.undone : null]} numberOfLines={1}>
              {item.tag}
            </Text>
            <Text style={[styles.rowState, { color: READ_TONE[item.tone].fg }]}>
              {item.undone ? 'Desfeito' : READ_TONE[item.tone].label}
            </Text>
          </View>
        )}
        ListEmptyComponent={<EmptyState text="Nenhuma tag lida neste lote." />}
      />
      <BatchFooter counts={run.counts} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
    padding: SPACE.lg,
    paddingBottom: SPACE.sm,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '600', color: COLOR.text },
  top: { paddingHorizontal: SPACE.lg, gap: SPACE.md },
  list: { padding: SPACE.lg, gap: SPACE.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACE.md,
    paddingVertical: SPACE.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.line,
  },
  rowTag: { flex: 1, fontSize: FONT_SIZE.base, color: COLOR.text },
  rowState: { fontSize: FONT_SIZE.small, fontWeight: '600' },
  undone: { textDecorationLine: 'line-through', color: COLOR.textFaint },
});
