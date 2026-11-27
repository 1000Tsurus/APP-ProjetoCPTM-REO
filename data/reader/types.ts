/** Estado da conexão com o leitor RFID; 'none' = leitor sem conexão própria (teclado). */
export type ReaderStatus = 'connected' | 'disconnected' | 'connecting' | 'none';

/** Fonte de tags RFID; o resto do app não sabe se vem do teclado ou do Bluetooth. */
export interface TagReader {
  status(): ReaderStatus;
  subscribe(onTag: (tag: string) => void, onStatus: (s: ReaderStatus) => void): () => void;
  reconnect(): Promise<void>;
}
