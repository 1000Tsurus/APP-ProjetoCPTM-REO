import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { workflowStyles as styles } from '@/components/operation/workflow-styles';
import { useSession } from '@/contexts/SessionContext';
import { changeOperationalFunction, decideRequest, localRequests, managementData, type AccessRequest, type ManagedProfile } from '@/data/access-service';

export default function OperatorsScreen() {
  const router = useRouter();
  const { profile, mode, canManage } = useSession();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [profiles, setProfiles] = useState<ManagedProfile[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [functions, setFunctions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    if (mode === 'local') { setRequests(await localRequests()); setLoaded(true); return; }
    if (!canManage) { setError('Acesso restrito à gerência autenticada.'); return; }
    const data = await managementData();
    setRequests(data.requests); setProfiles(data.profiles); setError(''); setLoaded(true);
  }, [mode, canManage]);
  useFocusEffect(useCallback(() => { if (profile) refresh().catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar solicitações.')); }, [refresh, profile]));
  useEffect(() => {
    if (!canManage) return;
    // Foreground in-app inbox only. Remote push delivery is not implemented.
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh().catch(() => setError('Não foi possível atualizar as solicitações.')); }, 30000);
    return () => clearInterval(timer);
  }, [canManage, refresh]);
  async function act(operation: () => Promise<unknown>, successMessage = 'Alteração confirmada pelo servidor.') {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(successMessage); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'O servidor não concluiu a ação.'); }
    finally { setBusy(false); }
  }
  if (!profile) return <Redirect href="/login" />;
  const pending = requests.filter((item) => item.status === 'pending');
  return <SafeAreaView style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondary}><Text>Voltar</Text></Pressable>
    <Text style={styles.title}>{mode === 'local' ? 'Solicitações locais' : 'Gestão de operadores'}</Text>
    <Text style={styles.notice}>{mode === 'local' ? 'Somente solicitações deste dispositivo. Não foram enviadas à gerência. Aprovar, rejeitar e atribuir funções exigem backend e sessão de gerente. Não há notificação remota.' : 'Aprovação e permissões dependem do servidor. Esta caixa é atualizada enquanto aberta. Notificações remotas ainda não estão integradas.'}</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!notice && <Text accessibilityRole="alert" style={styles.hint}>{notice}</Text>}
    {loaded && <Text accessibilityRole="alert" style={styles.heading}>{pending.length} solicitação(ões) pendente(s){mode === 'local' ? ' neste aparelho' : ''}</Text>}
    {requests.map((item) => <View key={item.id} style={styles.card}>
      <Text style={styles.heading}>{item.nomeCompleto}</Text><Text style={styles.hint}>{item.matriculaOuEmail} · {item.baseLotacao}</Text>
      <Text style={styles.hint}>Função solicitada: {item.funcaoOperacional} · Estado: {item.status === 'pending' ? 'Pendente' : item.status === 'approved' ? 'Aprovada' : 'Rejeitada'}</Text>
      {canManage && item.status === 'pending' && <><TextInput accessibilityLabel={`Função operacional para ${item.nomeCompleto}`} value={functions[item.id] ?? item.funcaoOperacional} onChangeText={(value) => setFunctions((previous) => ({ ...previous, [item.id]: value }))} style={styles.input} />
        <Pressable accessibilityRole="button" disabled={busy || !(functions[item.id] ?? item.funcaoOperacional).trim()} onPress={() => void act(() => decideRequest(item.id, 'approved', (functions[item.id] ?? item.funcaoOperacional).trim()))} style={styles.primary}><Text style={styles.primaryText}>Aprovar como operador</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void act(() => decideRequest(item.id, 'rejected', (functions[item.id] ?? item.funcaoOperacional).trim()))} style={styles.secondary}><Text>Rejeitar solicitação</Text></Pressable>
      </>}
    </View>)}
    {canManage && <><Text style={styles.heading}>Perfis dos operadores</Text><Text style={styles.hint}>A função operacional pode ser ajustada pela gerência. Perfis e histórico são preservados.</Text>
      {profiles.map((item) => <View key={item.id} style={styles.card}><Text style={styles.heading}>{item.nomeCompleto}</Text><Text style={styles.hint}>{item.matriculaOuEmail} · {item.baseLotacao} · {item.role === 'manager' ? 'Gerente' : 'Operador'} · {item.status}</Text>
        <TextInput accessibilityLabel={`Função de ${item.nomeCompleto}`} value={functions[`profile:${item.id}`] ?? item.funcaoOperacional} onChangeText={(value) => setFunctions((previous) => ({ ...previous, [`profile:${item.id}`]: value }))} style={styles.input} />
        <Pressable accessibilityRole="button" disabled={busy || !(functions[`profile:${item.id}`] ?? item.funcaoOperacional).trim()} onPress={() => void act(() => changeOperationalFunction(item.id, (functions[`profile:${item.id}`] ?? item.funcaoOperacional).trim()))} style={styles.secondary}><Text>Salvar função operacional</Text></Pressable>
      </View>)}</>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void act(refresh, 'Lista atualizada.')} style={styles.secondary}><Text>Atualizar solicitações</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
