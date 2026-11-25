// Validação do formulário de cadastro de dormente (cliente), antes de enviar à API.

export type SleeperFormField =
  | 'rfid_tag'
  | 'location_id'
  | 'species_id'
  | 'registration_record'
  | 'wood_class'
  | 'length_m'
  | 'treatment'
  | 'supplier'
  | 'inspection_company'
  | 'manufacture_year';

/** Comprimento em metros: aceita vírgula ou ponto, maior que zero, até 2 casas. Vazio = não informado. */
export function parseLength(raw: string): { value: number | null; error?: string } {
  const text = raw.trim().replace(',', '.');
  if (text === '') return { value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { value: null, error: 'Use número com até 2 casas decimais.' };
  const n = Number(text);
  if (!(n > 0)) return { value: null, error: 'O comprimento deve ser maior que zero.' };
  return { value: n };
}

/** Ano de fabricação: 4 dígitos entre 1900 e 2100. Vazio = não informado. */
export function parseYear(raw: string): { value: number | null; error?: string } {
  const text = raw.trim();
  if (text === '') return { value: null };
  if (!/^\d{4}$/.test(text)) return { value: null, error: 'Informe o ano com 4 dígitos.' };
  const n = Number(text);
  if (n < 1900 || n > 2100) return { value: null, error: 'O ano deve estar entre 1900 e 2100.' };
  return { value: n };
}

/** Campo do formulário apontado pelo primeiro erro 422 (último elemento de `loc`), se for conhecido. */
export function fieldFromErrors(errors?: { loc: (string | number)[] }[]): SleeperFormField | null {
  const loc = errors?.[0]?.loc;
  if (!loc || loc.length === 0) return null;
  const last = String(loc[loc.length - 1]);
  const known: SleeperFormField[] = [
    'rfid_tag',
    'location_id',
    'species_id',
    'registration_record',
    'wood_class',
    'length_m',
    'treatment',
    'supplier',
    'inspection_company',
    'manufacture_year',
  ];
  return known.find((f) => f === last) ?? null;
}
