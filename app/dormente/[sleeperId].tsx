import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { workflowStyles as styles } from '@/components/operation/workflow-styles';
import { useSession } from '@/contexts/SessionContext';
import { authorizeLot } from '@/data/access-service';
import { beginSleeperInspection, readStore, sleeperRecord, PHOTO_CATEGORIES, type Evidence, type Inspection, type SleeperRecord } from '@/data/inspection-store';
import { resolvePhoto } from '@/data/photo-storage';

const evaluation = (value: Inspection['evaluation']) => value === 'approved' ? 'Aprovado' : value === 'rejected' ? 'Reprovado' : 'Sem classificação';
export default function SleeperScreen() {
  const { sleeperId } = useLocalSearchParams<{ sleeperId: string }>();
  const { profile, mode } = useSession();
  const router = useRouter();
  const [record, setRecord] = useState<SleeperRecord | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    let alive = true;
    setRecord(null); setError('');
    if (!profile) return;
    (async () => {
      const store = await readStore();
      const item = sleeperRecord(store, sleeperId);
      if (!item) throw new Error('Dormente não encontrado neste dispositivo ou sessão.');
      await authorizeLot(item.lot.id, 'read');
      if (alive) { setRecord(item); setEvidence(store.evidence.filter((photo) => item.history.some((event) => event.id === photo.inspectionId))); }
    })().catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : 'Falha ao carregar o dormente.'); });
    return () => { alive = false; };
  }, [sleeperId, profile]));
  async function inspect() {
    if (!profile || !record || busy) return;
    setBusy(true); setError('');
    try {
      const event = await beginSleeperInspection(record.id, profile.matriculaOuEmail);
      router.push({ pathname: '/inspecionar/[lotId]', params: { lotId: record.lot.id, inspectionId: event.id } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a inspeção.'); }
    finally { setBusy(false); }
  }
  if (!profile) return <Redirect href="/login" />;
  const latest = record?.history.find((item) => item.status === 'completed');
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/lotes')} style={styles.secondary}><Text>Voltar</Text></Pressable>
    <Text style={styles.title}>{sleeperId}</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {record && <>
      <View style={styles.card}><Text style={styles.heading}>Lote de origem: {record.lot.code}</Text>
        <Text style={styles.hint}>{record.lot.line} · {record.lot.location}</Text><Text style={styles.hint}>Fornecedor: {record.lot.supplier}</Text>
        <Text style={styles.hint}>Dormente {record.number} de {record.lot.total} · Material: {latest?.material || record.lot.predominantMaterial}</Text>
        <Text style={styles.heading}>Situação: {latest ? evaluation(latest.evaluation) : 'Ainda não inspecionado'}</Text>
        <Text style={styles.hint}>Conservação: {latest?.condition || 'Não informada'} · {record.lot.status === 'finished' ? 'Lote finalizado' : 'Lote em operação'}</Text>
        <Text selectable style={styles.hint}>Identificador QR / texto NDEF da etiqueta NFC: raillog:sleeper:{record.id}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/lote/[lotId]', params: { lotId: record.lot.id } })} style={styles.secondary}><Text>Consultar lote de origem</Text></Pressable>
      </View>
      {!!record.history.length && <Text style={styles.notice}>Este dormente já possui {record.history.length} registro(s). A nova inspeção preserva todos os eventos e as fotografias anteriores. O lote de origem permanece {record.lot.code}.</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={inspect} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Abrindo...' : record.history.some((item) => item.status === 'in_progress') ? 'Continuar inspeção em rascunho' : record.history.length ? 'Registrar nova ocorrência / inspeção' : 'Inspecionar dormente'}</Text></Pressable>
      <Text style={styles.heading}>Histórico de inspeções</Text>
      {!record.history.length && <Text style={styles.hint}>Nenhuma inspeção anterior.</Text>}
      {record.history.map((item) => <View key={item.id} style={styles.card}>
        <Text style={styles.heading}>{item.kind === 'occurrence' ? 'Nova ocorrência' : 'Inspeção inicial'} · {item.status === 'completed' ? evaluation(item.evaluation) : 'Rascunho'}</Text>
        <Text style={styles.hint}>{new Date(item.createdAt).toLocaleString('pt-BR')} · Operador: {item.operatorId}</Text>
        <Text style={styles.hint}>Material: {item.material || 'Pendente'} · Conservação: {item.condition || 'Pendente'}</Text>
        <Text style={styles.hint}>Rachaduras: {item.cracks === null ? 'Pendente' : item.cracks ? 'Sim' : 'Não'} · Umidade: {item.humidity === null ? 'Pendente' : `${item.humidity}%`} · Vida residual: {item.residualYears === null ? 'Pendente' : `${item.residualYears} anos`}</Text>
        {evidence.filter((photo) => photo.inspectionId === item.id).map((photo) => <HistoricalPhoto key={photo.id} photo={photo} />)}
      </View>)}
      <Text style={styles.hint}>{mode === 'local' ? 'Histórico e fotos armazenados somente neste aparelho.' : 'Diagnósticos e fotos são rascunhos locais desta conta. Sincronização de inspeções e evidências ainda não integrada.'}</Text>
    </>}
  </ScrollView></SafeAreaView>;
}
function HistoricalPhoto({ photo }: { photo: Evidence }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let resolved: string | null = null;
    resolvePhoto(photo.uri).then((value) => {
      resolved = value;
      if (alive) setUri(value);
      else if (Platform.OS === 'web' && value?.startsWith('blob:')) URL.revokeObjectURL(value);
    }).catch(() => { if (alive) setUri(null); });
    return () => { alive = false; if (Platform.OS === 'web' && resolved?.startsWith('blob:')) URL.revokeObjectURL(resolved); };
  }, [photo.uri]);
  return <View><Text style={styles.hint}>{PHOTO_CATEGORIES.find((item) => item.id === photo.category)?.label} · {new Date(photo.capturedAt).toLocaleString('pt-BR')}</Text>{uri ? <Image accessibilityLabel="Evidência da inspeção anterior" source={{ uri }} style={styles.image} resizeMode="contain" /> : <Text style={styles.hint}>Fotografia indisponível neste dispositivo.</Text>}</View>;
}
