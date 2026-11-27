import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import { createKeyboardReader } from '@/data/reader/keyboard';
import type { TagReader } from '@/data/reader/types';

/** Leitor de tags do app; `push` existe só no leitor por teclado (o campo de texto "digita" a tag). */
export type ReaderHandle = TagReader & { push?: (raw: string) => void };

const ReaderContext = createContext<ReaderHandle | null>(null);

/** Fornece o leitor de tags. Neste PR é o leitor por teclado; o Bluetooth troca só esta linha. */
export function ReaderProvider({ children }: PropsWithChildren) {
  const [reader] = useState<ReaderHandle>(() => createKeyboardReader());
  return <ReaderContext.Provider value={reader}>{children}</ReaderContext.Provider>;
}

export function useReader(): ReaderHandle {
  const reader = useContext(ReaderContext);
  if (!reader) throw new Error('useReader requires ReaderProvider');
  return reader;
}
