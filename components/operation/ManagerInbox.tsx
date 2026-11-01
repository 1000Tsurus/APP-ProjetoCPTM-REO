import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Pressable, Text } from 'react-native';
import { useSession } from '@/contexts/SessionContext';
import { api, requireManager, type AccessRequest } from '@/data/access-service';
import { workflowStyles as styles } from './workflow-styles';

export function ManagerInbox() {
  const { canManage } = useSession();
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!canManage) { setCount(null); return; }
    async function refresh() {
      try {
        await requireManager();
        const requests = await api<AccessRequest[]>('/access-requests');
        if (alive) { setCount(requests.filter((item) => item.status === 'pending').length); setError(''); }
      } catch { if (alive) { setCount(null); setError('Não foi possível consultar as solicitações da gerência.'); } }
    }
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [canManage]));
  if (!canManage) return null;
  return <Pressable accessibilityRole="button" onPress={() => router.push('/operadores')} style={styles.card}>
    <Text accessibilityRole="alert" style={styles.heading}>{error || (count === null ? 'Consultando solicitações...' : count ? `${count} nova(s) solicitação(ões) pendente(s)` : 'Nenhuma solicitação pendente')}</Text>
    <Text style={styles.hint}>Abrir gestão de operadores → Aviso no app, atualizado a cada 30 s enquanto esta tela está aberta. Push remoto ainda não integrado.</Text>
  </Pressable>;
}
