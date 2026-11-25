import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/contexts/SessionContext';
import { listOutbox, subscribeOutbox } from './outbox';
import { syncNow as runSync, type SyncSummary } from './sync';

export type SyncResult = SyncSummary | 'offline' | 'busy' | null;

/**
 * Estado da fila e disparo da sincronização. Sincroniza ao montar e quando o app volta para
 * primeiro plano (com usuário logado); os contadores acompanham a fila em tempo real.
 */
export function useSync(): {
  pending: number;
  rejected: number;
  lastResult: SyncResult;
  syncing: boolean;
  syncNow: () => Promise<void>;
} {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [counts, setCounts] = useState({ pending: 0, rejected: 0 });
  const [lastResult, setLastResult] = useState<SyncResult>(null);
  const [syncing, setSyncing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshCounts = useCallback(async () => {
    if (!userId) {
      setCounts({ pending: 0, rejected: 0 });
      return;
    }
    const items = await listOutbox(userId);
    if (!mounted.current) return;
    const rejected = items.filter((i) => i.status === 'rejected').length;
    setCounts({ pending: items.length - rejected, rejected });
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!userId) return;
    setSyncing(true);
    try {
      const result = await runSync(userId);
      if (mounted.current) setLastResult(result);
    } catch {
      // Falha inesperada: a fila não foi alterada; o próximo disparo tenta de novo.
    } finally {
      if (mounted.current) setSyncing(false);
      await refreshCounts();
    }
  }, [userId, refreshCounts]);

  useEffect(() => {
    void refreshCounts();
    return subscribeOutbox(() => void refreshCounts());
  }, [refreshCounts]);

  useEffect(() => {
    if (!userId) return;
    void syncNow();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void syncNow();
    });
    return () => sub.remove();
  }, [userId, syncNow]);

  return { ...counts, lastResult, syncing, syncNow };
}
