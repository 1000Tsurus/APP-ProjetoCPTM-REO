import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { createBluetoothReader } from '@/data/reader/bluetooth';
import { forgetReader, getSavedReader, saveReader, type SavedReader } from '@/data/reader/device-store';
import { createKeyboardReader } from '@/data/reader/keyboard';
import type { TagReader } from '@/data/reader/types';
import { isAvailable, nativeSerial, requestPermissions } from '@/modules/reo-bluetooth';

/**
 * Leitor de tags do app. `push` existe só no leitor por teclado (o campo de texto "digita" a tag);
 * `onReaderError` e `close` existem só no Bluetooth.
 */
export type ReaderHandle = TagReader & {
  push?: (raw: string) => void;
  onReaderError?: (fn: (message: string) => void) => () => void;
  lastError?: () => string | null;
  close?: () => Promise<void>;
};

export type ReaderSettings = {
  saved: SavedReader | null;
  choose(r: SavedReader): Promise<void>;
  forget(): Promise<void>;
};

const ReaderContext = createContext<ReaderHandle | null>(null);
const SettingsContext = createContext<ReaderSettings | null>(null);

/** Cria o leitor certo: Bluetooth se o módulo nativo existe e há leitor salvo; senão o teclado. */
function buildReader(saved: SavedReader | null): ReaderHandle {
  if (saved && isAvailable()) {
    return createBluetoothReader({
      native: nativeSerial,
      address: saved.address,
      schedule: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
    });
  }
  return createKeyboardReader();
}

/** Fornece o leitor de tags e a escolha do leitor salvo; trocar ou esquecer fecha o anterior. */
export function ReaderProvider({ children }: PropsWithChildren) {
  const [reader, setReader] = useState<ReaderHandle>(() => createKeyboardReader());
  const [saved, setSaved] = useState<SavedReader | null>(null);
  const current = useRef<ReaderHandle>(reader);
  const seq = useRef(0); // trocas concorrentes: só a última vale

  const swap = useCallback(async (next: SavedReader | null) => {
    const mine = ++seq.current;
    const old = current.current;
    // Fecha o anterior antes de abrir o novo: dois leitores no mesmo aparelho brigam pela porta serial.
    void old.close?.();
    // Pede a permissão uma vez antes de conectar; se negada, o leitor ainda é criado e a falha
    // nativa ("sem permissão") aparece para o operador.
    if (next && isAvailable()) await requestPermissions().catch(() => false);
    if (mine !== seq.current) return; // outra troca (ou o desmonte) passou na frente
    const fresh = buildReader(next);
    current.current = fresh;
    setReader(fresh);
    setSaved(next);
  }, []);

  useEffect(() => {
    let alive = true;
    getSavedReader()
      .then((s) => {
        if (alive && s) return swap(s);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [swap]);

  // Ao desmontar o provedor, solta a porta serial do leitor em uso.
  useEffect(
    () => () => {
      seq.current += 1;
      void current.current.close?.();
    },
    [],
  );

  const settings = useMemo<ReaderSettings>(
    () => ({
      saved,
      async choose(r) {
        await saveReader(r);
        await swap(r);
      },
      async forget() {
        await forgetReader();
        await swap(null);
      },
    }),
    [saved, swap],
  );

  return (
    <SettingsContext.Provider value={settings}>
      <ReaderContext.Provider value={reader}>{children}</ReaderContext.Provider>
    </SettingsContext.Provider>
  );
}

export function useReader(): ReaderHandle {
  const reader = useContext(ReaderContext);
  if (!reader) throw new Error('useReader requires ReaderProvider');
  return reader;
}

export function useReaderSettings(): ReaderSettings {
  const s = useContext(SettingsContext);
  if (!s) throw new Error('useReaderSettings requires ReaderProvider');
  return s;
}
