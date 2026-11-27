import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/contexts/SessionContext';
import { listOutbox, subscribeOutbox } from './outbox';
import { lastSyncAt, syncNow as runSync, type SyncSummary } from './sync';

/** 'busy' nunca é guardado aqui: quem recebe 'busy' deixa o resultado para a sincronização em curso. */
export type SyncResult = SyncSummary | 'offline' | null;

/**
 * Estado da fila e disparo da sincronização. Sincroniza ao montar e quando o app volta para
 * primeiro plano (com usuário logado); os contadores acompanham a fila em tempo real.
 */
export function useSync(): {
  pending: number;
  rejected: number;
  lastResult: SyncResult;
  syncing: boolean;
  lastOkAt: string | null;
  syncNow: () => Promise<void>;
} {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [counts, setCounts] = useState({ pending: 0, rejected: 0 });
  const [lastResult, setLastResult] = useState<SyncResult>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastOkAt, setLastOkAt] = useState<string | null>(null);
  const mounted = useRef(true);
  // Chamadas em andamento deste hook: 'busy' devolve na hora, mas a primeira sync segue rodando.
  const inFlight = useRef(0);

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

  const refreshLastOk = useCallback(async () => {
    const at = userId ? await lastSyncAt(userId) : null;
    if (mounted.current) setLastOkAt(at);
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!userId) return;
    inFlight.current += 1;
    setSyncing(true);
    try {
      const result = await runSync(userId);
      // 'busy' não é resultado: outra sincronização está rodando e vai informar o dela.
      if (mounted.current && result !== 'busy') setLastResult(result);
    } catch {
      // Falha inesperada: a fila não foi alterada; o próximo disparo tenta de novo.
    } finally {
      inFlight.current -= 1;
      if (mounted.current) setSyncing(inFlight.current > 0);
      await refreshCounts().catch(() => undefined);
      await refreshLastOk().catch(() => undefined);
    }
  }, [userId, refreshCounts, refreshLastOk]);

  // Resultado da sync é do usuário anterior: zera ao trocar de usuário.
  useEffect(() => {
    setLastResult(null);
  }, [userId]);

  useEffect(() => {
    refreshLastOk().catch(() => undefined);
  }, [refreshLastOk]);

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

  return { ...counts, lastResult, syncing, lastOkAt, syncNow };
}
