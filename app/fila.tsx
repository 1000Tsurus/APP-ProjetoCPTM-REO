import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Banner, Button, EmptyState, Panel, SectionTitle } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import { discard, listOutbox, subscribeOutbox, type OutboxItem } from '@/data/outbox';
import { useSync } from '@/data/use-sync';

const TYPE_LABEL = { movement: 'Movimentação', inspection: 'Inspeção', occurrence: 'Ocorrência' } as const;

/** Linha de um item da fila; rejeitado mostra o motivo e só permite descartar. */
function QueueRow({ item, onDiscard }: { item: OutboxItem; onDiscard?: () => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.text}>{item.summary}</Text>
      {item.rfid_tag ? <Text style={[styles.code, { fontFamily: FONT_CODE }]}>{item.rfid_tag}</Text> : null}
      <Text style={styles.note}>
        {TYPE_LABEL[item.type]} · {new Date(item.created_at).toLocaleString('pt-BR')}
      </Text>
      {item.status === 'rejected' ? (
        <>
          <Badge text="Rejeitado" tone="danger" />
          <Text style={styles.reason}>{item.reason ?? 'Motivo não informado.'}</Text>
        </>
      ) : (
        <Badge text="Pendente" tone="warn" />
      )}
      {onDiscard ? <Button title="Descartar" icon="trash-outline" variant="ghost" small onPress={onDiscard} /> : null}
    </View>
  );
}

/** Fila offline do usuário: pendentes, rejeitados (com motivo) e envio manual. */
export default function QueueScreen() {
  const router = useRouter();
  const { user, offline } = useSession();
  const { syncing, syncNow, lastResult } = useSync();
  const [items, setItems] = useState<OutboxItem[]>([]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const refresh = () => {
      listOutbox(user.id)
        .then((all) => {
          if (alive) setItems(all);
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = subscribeOutbox(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [user]);

  // Resultado do último envio (do hook): só aparece depois de tocar em "Sincronizar agora".
  const [tapped, setTapped] = useState(false);
  const send = useCallback(async () => {
    setTapped(true);
    await syncNow();
  }, [syncNow]);
  let note: string | null = null;
  if (tapped && !syncing) {
    if (lastResult === 'offline') note = 'Sem conexão — tente de novo quando houver rede.';
    else if (lastResult === 'busy') note = 'Envio já em andamento.';
    else if (lastResult && lastResult.sent === 0) note = 'Nada para enviar.';
    else if (lastResult) note = `Enviados: ${lastResult.sent} (aceitos ${lastResult.accepted}, rejeitados ${lastResult.rejected}).`;
  }

  function confirmDiscard(item: OutboxItem) {
    if (!user) return;
    Alert.alert('Descartar este registro?', 'Ele não será enviado e não poderá ser recuperado.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => void discard(user.id, item.client_uuid) },
    ]);
  }

  const pending = items.filter((i) => i.status === 'pending');
  const rejected = items.filter((i) => i.status === 'rejected');

  return (
    <SafeAreaView style={styles.screen}>
      {offline ? <Banner tone="warn" text="Sem conexão" /> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <Button title="Voltar" icon="arrow-back" variant="ghost" small onPress={() => router.back()} />
        <Text style={styles.title}>Fila de envio</Text>
        <Button
          title={syncing ? 'Sincronizando…' : 'Sincronizar agora'}
          icon="sync-outline"
          disabled={syncing}
          onPress={() => void send()}
        />
        {note ? <Text style={styles.note}>{note}</Text> : null}

        <Panel accent={COLOR.amber} style={styles.panel}>
          <SectionTitle icon="cloud-upload-outline" title={`Pendentes (${pending.length})`} />
          {pending.length === 0 ? <EmptyState text="Nada pendente." /> : null}
          {pending.map((i) => (
            <QueueRow key={i.client_uuid} item={i} />
          ))}
        </Panel>

        <Panel accent={COLOR.red} style={styles.panel}>
          <SectionTitle icon="alert-circle-outline" title={`Rejeitados (${rejected.length})`} />
          {rejected.length === 0 ? <EmptyState text="Nenhum rejeitado." /> : null}
          {rejected.map((i) => (
            <QueueRow key={i.client_uuid} item={i} onDiscard={() => confirmDiscard(i)} />
          ))}
          {rejected.length > 0 ? (
            <Text style={styles.note}>Para corrigir, registre de novo pela tela do dormente e descarte o rejeitado.</Text>
          ) : null}
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.lg, gap: SPACE.md },
  title: { fontSize: 20, fontWeight: '600', color: COLOR.text },
  panel: { gap: SPACE.sm },
  row: { gap: 4, paddingVertical: SPACE.sm, alignItems: 'flex-start' },
  text: { fontSize: FONT_SIZE.base, color: COLOR.text },
  code: { fontSize: FONT_SIZE.small, color: COLOR.textDim },
  note: { fontSize: FONT_SIZE.small, color: COLOR.textFaint },
  reason: { fontSize: FONT_SIZE.small, color: COLOR.red },
});
