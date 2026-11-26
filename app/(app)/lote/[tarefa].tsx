import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EDGES_BELOW_STRIP } from '@/components/StatusStrip';

import { BatchPrepare } from '@/components/batch/BatchPrepare';
import { BatchReading } from '@/components/batch/BatchReading';
import { Button } from '@/components/ui';
import { COLOR, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import { canFieldWork } from '@/data/auth-store';
import type { BatchTask } from '@/data/batch';
import { rememberLocation } from '@/data/recent-locations';

// Parte da URL (português, contrato do app) -> tipo de tarefa do lote.
const TASK_BY_PARAM: Record<string, { kind: BatchTask['kind']; title: string }> = {
  receber: { kind: 'receive', title: 'Receber dormentes' },
  transferir: { kind: 'transfer', title: 'Transferir dormentes' },
  retirar: { kind: 'withdraw', title: 'Retirar para a via' },
  ocorrencia: { kind: 'occurrence', title: 'Registrar ocorrência' },
};

/** Lote: prepara a tarefa (local, RM ou ocorrência) e depois lê várias tags em sequência. */
export default function BatchScreen() {
  const router = useRouter();
  const { user } = useSession();
  const params = useLocalSearchParams<{ tarefa: string }>();
  const param = Array.isArray(params.tarefa) ? params.tarefa[0] : params.tarefa;
  const [task, setTask] = useState<BatchTask | null>(null);

  const def = param ? TASK_BY_PARAM[param] : undefined;
  if (!user) return <Redirect href="/login" />;
  // Supervisor só consulta; tarefa desconhecida volta ao Início.
  if (!def || !canFieldWork(user.role)) return <Redirect href="/" />;

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  function start(chosen: BatchTask) {
    if (!user) return;
    if (chosen.kind === 'receive' || chosen.kind === 'transfer') void rememberLocation(user.id, chosen.locationId);
    setTask(chosen);
  }

  return (
    <SafeAreaView edges={EDGES_BELOW_STRIP} style={styles.screen}>
      {task && user ? (
        <BatchReading task={task} userId={user.id} onDone={leave} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Button title="Voltar" icon="arrow-back" variant="ghost" small onPress={leave} />
            <Text style={styles.title}>{def.title}</Text>
            <BatchPrepare kind={def.kind} userId={user.id} onStart={start} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  flex: { flex: 1 },
  content: { padding: SPACE.lg, gap: SPACE.md },
  title: { fontSize: 20, fontWeight: '600', color: COLOR.text },
});
