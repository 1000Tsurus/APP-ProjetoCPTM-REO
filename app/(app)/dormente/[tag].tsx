import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EDGES_BELOW_STRIP } from '@/components/StatusStrip';

import { HistoryList } from '@/components/sleeper/HistoryList';
import { Badge, Banner, Button, EmptyState, Label, Panel, SectionTitle } from '@/components/ui';
import { COLOR, FONT_CODE, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import { errorMessage, NetworkError } from '@/data/api/client';
import { getSleeperHistory } from '@/data/api/endpoints';
import type { HistoryEntry, SleeperRead } from '@/data/api/types';
import { canFieldWork, canInspect } from '@/data/auth-store';
import { lookupSleeper, type LookupResult } from '@/data/catalog-cache';
import { label, SLEEPER_STATUS, speciesLabel } from '@/data/labels';
import { listOutbox, subscribeOutbox, type OutboxItem } from '@/data/outbox';
import { isValidTag, normalizeTag } from '@/data/tag';

const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v));

function formatLength(v: SleeperRead['length_m']): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : `${n.toLocaleString('pt-BR')} m`;
}

/** Linha rótulo/valor do cartão de dados do dormente. */
function Info({ name, value, mono }: { name: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.info}>
      <Label>{name}</Label>
      <Text style={[styles.text, mono ? { fontFamily: FONT_CODE } : null]}>{value}</Text>
    </View>
  );
}

/** Ficha do dormente pela tag: ações no topo conforme o papel, dados (ou cache), fila pendente e histórico (só online). */
export default function SleeperScreen() {
  const router = useRouter();
  const { user } = useSession();
  const params = useLocalSearchParams<{ tag: string }>();
  // O parâmetro já vem decodificado pelo expo-router; só normalizamos.
  const tag = normalizeTag(Array.isArray(params.tag) ? params.tag[0] : (params.tag ?? ''));

  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyNote, setHistoryNote] = useState<string | null>(null);
  const [queue, setQueue] = useState<OutboxItem[]>([]);
  // Descarta respostas de buscas antigas (foco repetido / troca de tag).
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!isValidTag(tag)) {
      setError('Tag inválida.');
      return;
    }
    const id = ++requestId.current;
    try {
      const r = await lookupSleeper(tag);
      if (id !== requestId.current) return;
      setResult(r);
      setError(null);
      setHistory(null);
      if (!('sleeper' in r)) {
        setHistoryNote(null);
        return;
      }
      if (r.fromCache) {
        setHistoryNote('Histórico indisponível sem conexão.');
        return;
      }
      setHistoryNote(null);
      try {
        const h = await getSleeperHistory(r.sleeper.id);
        if (id === requestId.current) setHistory(h.items);
      } catch (e) {
        if (id === requestId.current) {
          setHistoryNote(e instanceof NetworkError ? 'Histórico indisponível sem conexão.' : errorMessage(e));
        }
      }
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    }
  }, [tag]);

  // Recarrega ao voltar para a tela (ex.: depois de registrar uma ação).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Fila do usuário filtrada por esta tag; atualiza a cada mudança da fila.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const refresh = () => {
      listOutbox(user.id)
        .then((all) => {
          if (alive) setQueue(all.filter((i) => i.rfid_tag === tag));
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = subscribeOutbox(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [user, tag]);

  const found = result && 'sleeper' in result ? result : null;
  const role = user?.role;
  const discarded = found?.sleeper.status === 'discarded';
  const encoded = encodeURIComponent(tag);
  const go = (path: string) => router.push(`/${path}/${encoded}` as Href);
  const showActions = !!role && !discarded && !!result && !('notFound' in result);

  return (
    <SafeAreaView edges={EDGES_BELOW_STRIP} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button title="Voltar" icon="arrow-back" variant="ghost" small onPress={() => router.back()} />
        <Text style={[styles.tag, { fontFamily: FONT_CODE }]}>{tag}</Text>

        {showActions ? (
          <View style={styles.actions}>
            {role && canFieldWork(role) && found ? (
              <Button title="Completar plaqueta" icon="pricetag-outline" onPress={() => go('plaqueta')} />
            ) : null}
            {role && canFieldWork(role) ? (
              <Button title="Registrar ocorrência" icon="warning-outline" variant="ghost" onPress={() => go('ocorrencia')} />
            ) : null}
            {role && canInspect(role) ? (
              <Button title="Inspecionar" icon="clipboard-outline" variant="ghost" onPress={() => go('inspecionar')} />
            ) : null}
          </View>
        ) : null}
        {discarded ? <Text style={styles.note}>Dormente descartado: nenhuma ação disponível.</Text> : null}


        {error ? <Banner tone="warn" text={error} action={{ title: 'Tentar de novo', onPress: () => void load() }} /> : null}
        {!result && !error ? <ActivityIndicator color={COLOR.red} /> : null}

        {queue.length > 0 ? (
          <Panel accent={COLOR.amber} style={styles.panel}>
            <SectionTitle icon="cloud-upload-outline" title="Pendente de envio" />
            {queue.map((i) => (
              <View key={i.client_uuid} style={styles.queueRow}>
                <Text style={styles.text}>{i.summary}</Text>
                {i.status === 'rejected' ? (
                  <>
                    <Badge text="Rejeitado" tone="danger" />
                    {i.reason ? <Text style={styles.reason}>{i.reason}</Text> : null}
                  </>
                ) : (
                  <Badge text="Pendente" tone="warn" />
                )}
              </View>
            ))}
          </Panel>
        ) : null}

        {result && 'notFound' in result ? (
          <Panel style={styles.panel}>
            <SectionTitle icon="help-circle-outline" title="Tag não cadastrada" />
            <Text style={styles.text}>Nenhum dormente usa esta tag.</Text>
            {role && canFieldWork(role) ? (
              <Text style={styles.note}>Para cadastrar, leia a tag em Receber ou Transferir.</Text>
            ) : null}
          </Panel>
        ) : null}

        {result && 'offlineUnknown' in result ? (
          <Banner tone="warn" text="Sem conexão — não foi possível confirmar esta tag" />
        ) : null}

        {found ? (
          <>
            {found.fromCache ? (
              <Banner tone="info" text={`Dados de ${new Date(found.fetchedAt).toLocaleString('pt-BR')}`} />
            ) : null}
            <Panel style={styles.panel}>
              <SectionTitle icon="cube-outline" title="Dormente" />
              <Badge
                text={label(SLEEPER_STATUS, found.sleeper.status)}
                tone={SLEEPER_STATUS[found.sleeper.status]?.tone ?? 'neutro'}
              />
              <Info name="Tag RFID" value={found.sleeper.rfid_tag} mono />
              <Info name="Ata" value={dash(found.sleeper.registration_record)} mono />
              <Info
                name="Espécie"
                value={dash(speciesLabel(found.sleeper.species) || null)}
              />
              <Info name="Classe" value={dash(found.sleeper.wood_class)} />
              <Info name="Comprimento" value={formatLength(found.sleeper.length_m)} />
              <Info name="Tratamento" value={dash(found.sleeper.treatment)} />
              <Info name="Fornecedor" value={dash(found.sleeper.supplier)} />
              <Info name="Ano de fabricação" value={dash(found.sleeper.manufacture_year)} />
              <Info name="Local" value={dash(found.sleeper.current_location?.name)} />
            </Panel>

            <Panel style={styles.panel}>
              <SectionTitle icon="time-outline" title="Histórico" />
              {history ? (
                history.length > 0 ? <HistoryList items={history} /> : <EmptyState text="Sem eventos registrados." />
              ) : historyNote ? (
                <Text style={styles.note}>{historyNote}</Text>
              ) : (
                <ActivityIndicator color={COLOR.red} />
              )}
            </Panel>
          </>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  content: { padding: SPACE.lg, gap: SPACE.md },
  tag: { fontSize: 20, fontWeight: '600', color: COLOR.text },
  panel: { gap: SPACE.sm },
  info: { gap: 2 },
  text: { fontSize: FONT_SIZE.base, color: COLOR.text },
  note: { fontSize: FONT_SIZE.small, color: COLOR.textFaint },
  reason: { fontSize: FONT_SIZE.small, color: COLOR.red },
  queueRow: { gap: 4, paddingVertical: 4 },
  actions: { gap: SPACE.sm },
});
