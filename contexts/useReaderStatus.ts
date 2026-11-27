import { useEffect, useState } from 'react';

import { readerStatusText } from '@/data/status-text';
import type { ReaderStatus } from '@/data/reader/types';
import { useReader } from './ReaderContext';

/**
 * Estado do leitor para a tela: status e texto (com o modo da chave). O texto vai no state
 * porque mudança só de modo não muda o status e ainda assim precisa redesenhar.
 */
export function useReaderStatus(): { status: ReaderStatus; text: string } {
  const reader = useReader();
  const read = () => ({ status: reader.status(), text: readerStatusText(reader.status(), reader.mode()) });
  const [state, setState] = useState(read);

  useEffect(() => {
    setState(read());
    return reader.subscribe(
      () => undefined,
      () => setState(read()),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader]);

  return state;
}
