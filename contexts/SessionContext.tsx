import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

import { getState, login, logout, restore, subscribe, type SessionState } from '@/data/auth-store';
import type { UserRead } from '@/data/api/types';
import { refreshCatalogs } from '@/data/catalog-cache';
import { pendingCount } from '@/data/outbox';

type SessionValue = {
  state: SessionState;
  user: UserRead | null;
  offline: boolean;
  /** false enquanto `restore()` não terminou; o login não deve aparecer antes disso. */
  ready: boolean;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

/** Atualiza espécies e locais em segundo plano; falha de rede aqui não atrapalha ninguém. */
function warmCatalogs(): void {
  refreshCatalogs().catch(() => undefined);
}

/** Pergunta antes de sair quando há registros não enviados; resolve true se o usuário confirmar. */
function confirmLeave(pending: number): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Sair da conta',
      `${pending === 1 ? 'Há 1 registro não enviado' : `Há ${pending} registros não enviados`}. ${pending === 1 ? 'Ele fica guardado' : 'Eles ficam guardados'} neste aparelho até você entrar de novo.`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Sair', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Mantém o estado da sessão (auth-store) para a interface e reabre a sessão salva ao iniciar. */
export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>(getState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribe(setState);
    let alive = true;
    restore()
      .then((s) => {
        if (alive && s.status === 'online') warmCatalogs();
      })
      .catch(() => undefined) // erro inesperado: segue deslogado, o login resolve
      .finally(() => {
        if (alive) {
          setState(getState());
          setReady(true);
        }
      });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (loginName: string, password: string) => {
    await login(loginName.trim(), password);
    warmCatalogs();
  }, []);

  const signOut = useCallback(async () => {
    const current = getState();
    if (current.status !== 'signed_out') {
      const pending = await pendingCount(current.user.id);
      if (pending > 0 && !(await confirmLeave(pending))) return;
    }
    await logout();
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      state,
      user: state.status === 'signed_out' ? null : state.user,
      offline: state.status === 'offline',
      ready,
      signIn,
      signOut,
    }),
    [state, ready, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requires SessionProvider');
  return session;
}
