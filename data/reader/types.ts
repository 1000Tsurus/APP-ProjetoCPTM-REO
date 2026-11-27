/** Estado da conexão com o leitor RFID; 'none' = leitor sem conexão própria (teclado). */
export type ReaderStatus = 'connected' | 'disconnected' | 'connecting' | 'none';

/** Posição da chave gangorra do leitor ESP32. */
export type ReaderMode = 'LEITURA' | 'GRAVACAO' | 'DESLIGADO';

/** Fonte de tags RFID; o resto do app não sabe se vem do teclado ou do Bluetooth. */
export interface TagReader {
  status(): ReaderStatus;
  /** Modo informado pelo leitor; `null` até chegar. Mudanças de modo avisam o `onStatus`. */
  mode(): ReaderMode | null;
  subscribe(onTag: (tag: string) => void, onStatus: (s: ReaderStatus) => void): () => void;
  reconnect(): Promise<void>;
}
