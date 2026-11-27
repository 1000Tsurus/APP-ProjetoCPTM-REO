const DEFAULT_API_URL = 'https://reo-api.ambitiousbeach-eac3bf23.brazilsouth.azurecontainerapps.io';

/** Resolve a URL base da API: padrão Azure, sem barra final; `http://` só em desenvolvimento (tráfego sem TLS em produção é inseguro). */
export function apiBaseUrl(env: string | undefined, dev: boolean): string {
  const url = (env?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
  if (url.toLowerCase().startsWith('http://') && !dev) {
    throw new Error('EXPO_PUBLIC_API_URL deve usar https fora do modo de desenvolvimento.');
  }
  return url;
}

// `__DEV__` não existe fora do React Native (ex.: testes em Node), por isso o guard.
export const API_URL = apiBaseUrl(
  process.env.EXPO_PUBLIC_API_URL,
  typeof __DEV__ !== 'undefined' && __DEV__,
);
