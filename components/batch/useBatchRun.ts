import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';

import { useReader } from '@/contexts/ReaderContext';
import type { BatchTask, ReadTone } from '@/data/batch';
import {
  batchCounts,
  createBatchSession,
  keepsCurrentCard,
  undoButtonMs,
  type BatchRead,
  type BatchSession,
} from '@/data/batch-session';
import { lookupSleeper } from '@/data/catalog-cache';
import { enqueue, listOutbox, releaseHolds, subscribeOutbox, undo } from '@/data/outbox';
import { syncNow } from '@/data/sync';
import { uuidv4 } from '@/data/uuid';

type Counts = ReturnType<typeof batchCounts>;

/** Vibração por resultado: curta para registro, dupla para aviso (inclui "já lido"), longa para erro. */
function vibrate(tone: ReadTone): void {
  if (tone === 'error') Vibration.vibrate(400);
  else if (tone === 'warn') Vibration.vibrate([0, 60, 80, 60]);
  else Vibration.vibrate(60);
}

/**
 * Liga a tela ao lote: cria a sessão, alimenta com as tags do leitor, acompanha lista e totais
 * e fecha o lote ao concluir ou ao sair da tela (a leitura para antes de fechar).
 */
export function useBatchRun(task: BatchTask, userId: string) {
  const reader = useReader();
  const [reads, setReads] = useState<BatchRead[]>([]);
  const [card, setCard] = useState<BatchRead | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoNote, setUndoNote] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>({ read: 0, sent: 0, queued: 0, rejected: 0 });
  const sessionRef = useRef<BatchSession | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const finished = useRef(false);
  // Cartão atual sem depender do render, para decidir se uma repetição o substitui.
  const cardRef = useRef<BatchRead | null>(null);
  // Itens vistos rejeitados na fila: se forem descartados depois, continuam contando como rejeitados.
  const rejectedSeen = useRef<Set<string>>(new Set());

  const handleTag = useCallback((tag: string) => {
    const session = sessionRef.current;
    if (!session || finished.current) return;
    session
      .read(tag)
      .then((r) => {
        vibrate(r.tone);
        if (keepsCurrentCard(cardRef.current, r)) {
          // Repetição da tag do cartão: mantém o cartão e o Desfazer, só avisa.
          setUndoNote(r.message);
          return;
        }
        setUndoNote(null);
        cardRef.current = r;
        setCard(r);
      })
      .catch(() => undefined);
  }, []);

  /** Para de ouvir o leitor e fecha o lote (solta as leituras e envia); só roda uma vez. */
  const finish = useCallback(async (force: boolean) => {
    const session = sessionRef.current;
    if (finished.current || !session) return;
    finished.current = true;
    stopRef.current?.();
    stopRef.current = null;
    // Ao sair sem ter lido nada não há o que fechar; "Concluir" fecha sempre.
    if (!force && session.reads().length === 0) return;
    await session.finish().catch(() => undefined);
  }, []);

  useEffect(() => {
    const session = createBatchSession({
      userId,
      task,
      lookup: lookupSleeper,
      enqueue,
      undo,
      releaseHolds,
      // Envio em segundo plano: "Concluir" não espera a rede, só a liberação das leituras.
      sync: () => {
        syncNow(userId).catch(() => undefined);
        return Promise.resolve();
      },
      uuid: uuidv4,
      now: () => new Date(),
      schedule: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
    });
    sessionRef.current = session;
    finished.current = false;
    cardRef.current = null;
    rejectedSeen.current = new Set();
    let alive = true;
    const refresh = () => {
      setReads(session.reads());
      listOutbox(userId)
        .then((items) => {
          for (const i of items) if (i.status === 'rejected') rejectedSeen.current.add(i.client_uuid);
          if (alive) setCounts(batchCounts(session.reads(), items, rejectedSeen.current));
        })
        .catch(() => undefined);
    };
    const offSession = session.subscribe(refresh);
    const offOutbox = subscribeOutbox(refresh);
    const offReader = reader.subscribe(handleTag, () => undefined);
    // ERRO: do leitor vira aviso curto; não registra leitura.
    const offError = reader.onReaderError?.((message) => setUndoNote(`Leitor: ${message}`));
    stopRef.current = () => {
      offReader();
      offError?.();
    };
    return () => {
      alive = false;
      offSession();
      offOutbox();
      void finish(false);
    };
  }, [task, userId, reader, handleTag, finish]);

  // "Desfazer" fica aberto até 500 ms antes do fim da espera gravada na fila (`holdUntil`).
  useEffect(() => {
    if (!card?.clientUuid || card.undone || card.tone === 'error' || card.tone === 'warn') {
      setUndoOpen(false);
      return;
    }
    const left = undoButtonMs(card, Date.now());
    if (left <= 0) {
      setUndoOpen(false);
      return;
    }
    setUndoOpen(true);
    const t = setTimeout(() => setUndoOpen(false), left);
    return () => clearTimeout(t);
  }, [card]);

  const undoCard = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !card?.clientUuid) return;
    const ok = await session.undo(card.clientUuid).catch(() => false);
    if (ok) {
      const next = { ...card, undone: true };
      cardRef.current = next;
      setCard(next);
      setUndoNote(null);
    } else {
      setUndoNote('Prazo para desfazer acabou — a leitura segue na fila.');
    }
  }, [card]);

  return { reads, card, counts, undoOpen, undoNote, handleTag, undoCard, finish: () => finish(true) };
}
