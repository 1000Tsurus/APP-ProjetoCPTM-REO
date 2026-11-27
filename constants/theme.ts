// Tema visual do app, cópia do padrão do site gerencial (src/ui.jsx).
// Só estas cores devem aparecer nas telas; trocar um valor muda o app todo.
export const COLOR = {
  bg: '#F5F5F5',
  panel: '#FFFFFF',
  panelAlt: '#F8F8F8',
  line: '#E2E2E2',
  red: '#E2001A', // vermelho do logo CPTM (marca / crítico)
  redTint: '#FDE5E8',
  redDark: '#B00014',
  redDeep: '#78000E',
  brandGray: '#707173', // cinza do logo CPTM
  amber: '#947100', // aviso (offline, pendências)
  amberTint: '#FFF5C2',
  amberLine: '#EEDC8A',
  green: '#168821', // ok / sucesso
  greenTint: '#E3F2E5',
  greenLine: '#B9DDBE',
  blue: '#1351B4', // informativo / ação secundária
  blueTint: '#DBE8FB',
  text: '#333333',
  textDim: '#5E6066',
  textFaint: '#888A8E',
} as const;

// Cantos: campos e botões 4, cartões 6 (igual ao site).
export const RADIUS = { field: 4, panel: 6 } as const;

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

// Fonte base 16 (uso em campo, com luva e sol); códigos em fonte monoespaçada.
export const FONT_SIZE = { base: 16, small: 14, caption: 12.5 } as const;
export const FONT_CODE = 'monospace';

// Alvo de toque mínimo (px) em botões e campos.
export const MIN_TOUCH = 48;

export type Tone = 'ok' | 'info' | 'warn' | 'danger' | 'neutro';
