import type { ReaderStatus } from './reader/types';

export type StatusTone = 'ok' | 'warn' | 'error';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Texto e tom da faixa de status de envio, por prioridade: rejeitados, offline, enviando, pendentes, tudo enviado. */
export function syncStatusText(s: {
  pending: number;
  rejected: number;
  offline: boolean;
  syncing: boolean;
  lastOkAt: string | null;
  now: Date;
}): { text: string; tone: StatusTone } {
  if (s.rejected > 0) {
    const extra = s.pending > 0 ? ` · ${plural(s.pending, 'pendente', 'pendentes')}` : '';
    return { text: `${plural(s.rejected, 'rejeitado', 'rejeitados')}${extra}`, tone: 'error' };
  }
  if (s.offline) {
    const extra = s.pending > 0 ? ` · ${plural(s.pending, 'pendente', 'pendentes')}` : '';
    return { text: `Sem conexão${extra}`, tone: 'warn' };
  }
  if (s.syncing) return { text: 'Enviando…', tone: 'ok' };
  if (s.pending > 0) {
    const when = s.lastOkAt ? `enviado ${hhmm(s.lastOkAt)}` : 'nunca enviado';
    return { text: `${plural(s.pending, 'pendente', 'pendentes')} · ${when}`, tone: 'warn' };
  }
  return { text: s.lastOkAt ? `Tudo enviado · ${hhmm(s.lastOkAt)}` : 'Tudo enviado', tone: 'ok' };
}

/** Rótulo do estado do leitor na faixa de status. */
export function readerStatusText(s: ReaderStatus): string {
  switch (s) {
    case 'connected':
      return '● Conectado';
    case 'disconnected':
      return '○ Desconectado';
    case 'connecting':
      return 'Conectando…';
    default:
      return 'Teclado';
  }
}
