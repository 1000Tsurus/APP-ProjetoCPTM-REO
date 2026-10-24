import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

export type OperatorProfile = {
  nomeCompleto: string;
  matriculaOuEmail: string;
  funcaoOperacional: string;
  baseLotacao: string;
};

const PROFILE_KEY = 'cptm.operatorProfile';

// Profile only: no passwords or authentication tokens are stored by this prototype.
export async function findOperatorProfile(identifier?: string): Promise<OperatorProfile | null> {
  try {
    const raw = Platform.OS === 'web'
      ? (typeof window !== 'undefined' ? window.sessionStorage.getItem(PROFILE_KEY) : null)
      : await SecureStore.getItemAsync(PROFILE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!['nomeCompleto', 'matriculaOuEmail', 'funcaoOperacional', 'baseLotacao']
      .every((key) => typeof value?.[key] === 'string')) return null;
    return identifier === undefined || value.matriculaOuEmail.toLowerCase() === identifier.trim().toLowerCase()
      ? value : null;
  } catch {
    return null;
  }
}

const SessionContext = createContext<{
  profile: OperatorProfile | null;
  profileUpdated: boolean;
  startSession: (profile: OperatorProfile) => Promise<void>;
  updateProfile: (changes: Pick<OperatorProfile, 'nomeCompleto'>) => Promise<void>;
  clearProfileUpdated: () => void;
  endSession: () => Promise<void>;
} | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [profileUpdated, setProfileUpdated] = useState(false);

  async function startSession(next: OperatorProfile) {
    try {
      const raw = JSON.stringify(next);
      if (Platform.OS === 'web') window.sessionStorage.setItem(PROFILE_KEY, raw);
      else await SecureStore.setItemAsync(PROFILE_KEY, raw);
    } catch {
      // Unavailable device storage must not prevent use of the in-memory profile.
    }
    setProfile(next);
    setProfileUpdated(false);
  }

  async function updateProfile(changes: Pick<OperatorProfile, 'nomeCompleto'>) {
    if (!profile) throw new Error('Sessão não iniciada.');
    const nomeCompleto = changes.nomeCompleto.trim().replace(/\s+/g, ' ');
    if (nomeCompleto.length < 3) throw new Error('Informe um nome completo com pelo menos 3 caracteres.');
    const next = { ...profile, nomeCompleto };
    const raw = JSON.stringify(next);
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') throw new Error('Armazenamento indisponível.');
      window.sessionStorage.setItem(PROFILE_KEY, raw);
    } else {
      await SecureStore.setItemAsync(PROFILE_KEY, raw);
    }
    setProfile(next);
    setProfileUpdated(true);
  }

  async function endSession() {
    setProfile(null);
    setProfileUpdated(false);
    try {
      // Retain the last profile for a later matching login; it is not a credential.
      if (Platform.OS !== 'web') await SecureStore.deleteItemAsync('cptm.keepConnectedUntil');
    } catch {
      // The active session has already been cleared.
    }
  }

  return <SessionContext.Provider value={{ profile, profileUpdated, startSession, updateProfile, clearProfileUpdated: () => setProfileUpdated(false), endSession }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requires SessionProvider');
  return session;
}
