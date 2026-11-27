import { parseReaderLine } from './protocol';
import type { ReaderMode, ReaderStatus, TagReader } from './types';

/** Porta serial Bluetooth nativa (injetada); o módulo nativo a implementa. */
export type NativeSerial = {
  connect(address: string): Promise<void>;
  disconnect(): Promise<void>;
  onLine(fn: (line: string) => void): () => void;
  onState(fn: (connected: boolean) => void): () => void;
};

/** Esperas entre tentativas (ms); a última se repete. */
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];

/**
 * Leitor RFID por Bluetooth (ESP32). Reconecta sozinho com espera crescente
 * (1s até 30s) porque o operador anda pelo pátio e sai do alcance do leitor.
 * `schedule` é injetado para os testes não dependerem de relógio; devolve o cancelador.
 */
export function createBluetoothReader(deps: {
  native: NativeSerial;
  address: string;
  schedule: (fn: () => void, ms: number) => () => void;
}): TagReader & {
  onReaderError(fn: (message: string) => void): () => void;
  lastError(): string | null;
  close(): Promise<void>;
} {
  const { native, address, schedule } = deps;
  const tagListeners = new Set<(tag: string) => void>();
  const statusListeners = new Set<(s: ReaderStatus) => void>();
  const errorListeners = new Set<(message: string) => void>();
  let status: ReaderStatus = 'disconnected';
  let lastError: string | null = null; // motivo da última falha de conexão (some ao conectar)
  let mode: ReaderMode | null = null;
  let attempt = 0;
  let closed = false;
  let cancelWait: (() => void) | null = null;
  let token = 0; // identifica a tentativa atual; resultados de tentativas antigas são descartados

  const notify = () => {
    for (const l of [...statusListeners]) l(status);
  };
  const setStatus = (s: ReaderStatus) => {
    status = s;
    notify();
  };
  const clearWait = () => {
    cancelWait?.();
    cancelWait = null;
  };

  function scheduleRetry() {
    if (closed) return;
    clearWait();
    const ms = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt += 1;
    cancelWait = schedule(() => {
      cancelWait = null;
      void connectNow();
    }, ms);
  }

  async function connectNow(): Promise<void> {
    if (closed) return;
    clearWait();
    const mine = ++token;
    setStatus('connecting');
    try {
      await native.connect(address);
    } catch (e) {
      if (closed || mine !== token) return;
      const message = e instanceof Error && e.message ? e.message : 'Não foi possível conectar ao leitor.';
      // Só avisa quando o motivo muda: cada nova tentativa falha igual e não deve repetir o aviso.
      if (message !== lastError) {
        lastError = message;
        for (const l of [...errorListeners]) l(message);
      }
      setStatus('disconnected');
      scheduleRetry();
    }
  }

  const offLine = native.onLine((line) => {
    if (closed) return;
    const parsed = parseReaderLine(line);
    if (parsed.kind === 'tag') {
      // Chave em GRAVACAO: o leitor não está lendo para o app; a faixa já avisa, então não registra.
      if (mode === 'GRAVACAO') return;
      for (const l of [...tagListeners]) l(parsed.tag);
    } else if (parsed.kind === 'mode') {
      mode = parsed.mode;
      notify();
    } else if (parsed.kind === 'error') {
      for (const l of [...errorListeners]) l(parsed.message);
    }
  });

  const offState = native.onState((connected) => {
    if (closed) return;
    if (connected) {
      attempt = 0; // conexão boa: a próxima queda recomeça em 1s
      lastError = null;
      clearWait();
      setStatus('connected');
      return;
    }
    mode = null;
    // Falha durante uma conexão em andamento é tratada pelo catch do connect.
    if (status !== 'connected') return; // já desconectado: a falha do connect agendou a nova tentativa
    setStatus('disconnected');
    scheduleRetry();
  });

  void connectNow();

  return {
    status: () => status,
    lastError: () => lastError,
    mode: () => mode,
    subscribe(onTag, onStatus) {
      tagListeners.add(onTag);
      statusListeners.add(onStatus);
      return () => {
        tagListeners.delete(onTag);
        statusListeners.delete(onStatus);
      };
    },
    onReaderError(fn) {
      errorListeners.add(fn);
      return () => {
        errorListeners.delete(fn);
      };
    },
    async reconnect() {
      // O ESP32 aceita um cliente só: reconectar com o enlace bom derrubaria a leitura.
      if (status === 'connected') return;
      attempt = 0;
      await connectNow();
    },
    async close() {
      closed = true;
      token += 1;
      clearWait();
      offLine();
      offState();
      mode = null;
      status = 'disconnected';
      try {
        await native.disconnect();
      } catch {
        // Já desconectado: nada a fazer.
      }
    },
  };
}
