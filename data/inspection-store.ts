import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, authorizeLot, backendConfigured, operationalStorageKey, requireManager } from './access-service';

export type Material = 'Ipê' | 'Aroeira' | 'Eucalipto' | 'Concreto';
export type LotStatus = 'waiting' | 'inspection' | 'finished';
export type InspectionStatus = 'in_progress' | 'completed';
export type Evaluation = 'approved' | 'rejected' | 'unclassified';
export type PhotoCategory = 'general' | 'fixing' | 'fissure' | 'base';

export const PHOTO_CATEGORIES: { id: PhotoCategory; label: string; help: string }[] = [
  { id: 'general', label: 'Visão Geral', help: 'Dormente completo' },
  { id: 'fixing', label: 'Fixação', help: 'Elementos de fixação' },
  { id: 'fissure', label: 'Fissura Central', help: 'Região central' },
  { id: 'base', label: 'Lastro / Base', help: 'Base e lastro' },
];

export type Lot = {
  id: string; code: string; line: string; location: string; supplier: string;
  predominantMaterial: Material; total: number; receiptDate: string;
  notes: string; operatorId: string; operatorName: string;
  createdAt: string; status: LotStatus; finishedAt?: string;
};
export type Inspection = {
  kind?: 'initial' | 'occurrence';
  id: string; lotId: string; sleeperNumber: number; sleeperId: string;
  operatorId: string; material: Material | null;
  condition: 'Bom' | 'Regular' | 'Ruim' | null;
  cracks: boolean | null; humidity: number | null; residualYears: number | null;
  step: 'diagnosis' | 'photos'; status: InspectionStatus; evaluation: Evaluation | null;
  createdAt: string; updatedAt: string; completedAt?: string;
};
export type Evidence = {
  id: string; inspectionId: string; category: PhotoCategory;
  uri: string; capturedAt: string;
};
export type Store = { version: 1; lots: Lot[]; inspections: Inspection[]; evidence: Evidence[] };
const empty = (): Store => ({ version: 1, lots: [], inspections: [], evidence: [] });
let queue: Promise<unknown> = Promise.resolve();

export async function readStore(): Promise<Store> {
  const raw = await AsyncStorage.getItem(operationalStorageKey());
  if (!raw) return empty();
  const parsed = JSON.parse(raw) as Store;
  if (parsed.version !== 1 || !Array.isArray(parsed.lots) || !Array.isArray(parsed.inspections) || !Array.isArray(parsed.evidence)) {
    throw new Error('Os dados locais de inspeção precisam de recuperação.');
  }
  return parsed;
}

function mutate<T>(operation: (store: Store) => T | Promise<T>): Promise<T> {
  const key = operationalStorageKey();
  const result = queue.then(async () => {
    if (key !== operationalStorageKey()) throw new Error('A sessão mudou. Abra novamente o registro.');
    const store = await readStore();
    const value = await operation(store);
    if (key !== operationalStorageKey()) throw new Error('A sessão mudou. Abra novamente o registro.');
    await AsyncStorage.setItem(key, JSON.stringify(store));
    return value;
  });
  queue = result.catch(() => undefined);
  return result;
}

export function createLot(input: Omit<Lot, 'id' | 'code' | 'createdAt' | 'status'>, start: boolean) {
  return mutate(async (store) => {
    await requireManager();
    // The backend creates the record and validates role, approval and scope atomically.
    const lot = await api<Lot>('/lots', { method: 'POST', body: { ...input, start } });
    if (!lot.id || !/^LT-\d+$/.test(lot.code) || !Number.isInteger(lot.total) || lot.total < 1) throw new Error('Lote retornado pelo serviço é inválido. Atualize a lista antes de tentar novamente.');
    store.lots = store.lots.filter((item) => item.id !== lot.id);
    store.lots.push(lot);
    return lot;
  });
}

export function startLot(lotId: string) {
  return mutate(async (store) => {
    await authorizeLot(lotId, 'inspect');
    const lot = store.lots.find((item) => item.id === lotId);
    if (!lot || lot.status === 'finished') throw new Error('Lote indisponível para inspeção.');
    lot.status = 'inspection';
    return lot;
  });
}

export function getOrCreateCurrentInspection(lotId: string, operatorId: string) {
  return mutate(async (store) => {
    await authorizeLot(lotId, 'inspect');
    const lot = store.lots.find((item) => item.id === lotId);
    if (!lot || lot.status === 'finished') throw new Error('Lote indisponível para inspeção.');
    let inspection = store.inspections.find((item) => item.lotId === lotId && item.kind !== 'occurrence' && item.status === 'in_progress');
    if (inspection) return inspection;
    const completedNumbers = new Set(store.inspections.filter((item) => item.lotId === lotId && item.kind !== 'occurrence' && item.status === 'completed').map((item) => item.sleeperNumber));
    const next = Array.from({ length: lot.total }, (_, index) => index + 1).find((number) => !completedNumbers.has(number));
    if (!next) return null;
    const now = new Date().toISOString();
    inspection = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      kind: 'initial',
      lotId, sleeperNumber: next, sleeperId: `${lot.code}-D${String(next).padStart(4, '0')}`,
      operatorId, material: lot.predominantMaterial, condition: null, cracks: null,
      humidity: null, residualYears: null, step: 'diagnosis', status: 'in_progress',
      evaluation: null, createdAt: now, updatedAt: now,
    };
    store.inspections.push(inspection);
    lot.status = 'inspection';
    return inspection;
  });
}

export function saveDiagnosis(id: string, changes: Partial<Pick<Inspection, 'material' | 'condition' | 'cracks' | 'humidity' | 'residualYears' | 'step'>>) {
  return mutate(async (store) => {
    const item = store.inspections.find((inspection) => inspection.id === id);
    if (!item || item.status === 'completed') throw new Error('Esta inspeção não pode mais ser alterada.');
    await authorizeLot(item.lotId, 'inspect');
    Object.assign(item, changes, { updatedAt: new Date().toISOString() });
    return item;
  });
}

export function saveEvidence(inspectionId: string, category: PhotoCategory, uri: string) {
  return mutate(async (store) => {
    const inspection = store.inspections.find((item) => item.id === inspectionId);
    if (!inspection || inspection.status === 'completed') throw new Error('Esta inspeção não pode mais ser alterada.');
    await authorizeLot(inspection.lotId, 'inspect');
    const previous = store.evidence.find((item) => item.inspectionId === inspectionId && item.category === category);
    const evidence: Evidence = { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, inspectionId, category, uri, capturedAt: new Date().toISOString() };
    store.evidence = store.evidence.filter((item) => item !== previous);
    store.evidence.push(evidence);
    inspection.step = 'photos';
    inspection.updatedAt = evidence.capturedAt;
    return previous;
  });
}

export function diagnosisMissing(item: Inspection) {
  const missing: string[] = [];
  if (!item.material) missing.push('tipo de material');
  if (!item.condition) missing.push('estado de conservação');
  if (item.cracks === null) missing.push('rachaduras estruturais');
  if (item.humidity === null || !Number.isFinite(item.humidity) || item.humidity < 0 || item.humidity > 100) missing.push('umidade medida');
  if (item.residualYears === null || !Number.isInteger(item.residualYears) || item.residualYears < 0) missing.push('vida útil residual');
  return missing;
}

export function completeInspection(id: string, evaluation: Evaluation) {
  return mutate(async (store) => {
    const item = store.inspections.find((inspection) => inspection.id === id);
    if (!item || item.status === 'completed') throw new Error('Inspeção indisponível para conclusão.');
    await authorizeLot(item.lotId, 'inspect');
    const missing = diagnosisMissing(item);
    if (missing.length) throw new Error(`Preencha: ${missing.join(', ')}.`);
    const photos = store.evidence.filter((photo) => photo.inspectionId === id);
    const missingPhotos = PHOTO_CATEGORIES.filter((category) => !photos.some((photo) => photo.category === category.id));
    if (missingPhotos.length) throw new Error(`Fotografias pendentes: ${missingPhotos.map((photo) => photo.label).join(', ')}.`);
    item.status = 'completed'; item.evaluation = evaluation; item.step = 'photos';
    item.completedAt = new Date().toISOString(); item.updatedAt = item.completedAt;
    return item;
  });
}

export function lotMetrics(store: Store, lot: Lot) {
  // Occurrences preserve history; progress and acceptance count each sleeper once.
  const bySleeper = new Map<string, Inspection>();
  for (const item of store.inspections) {
    if (item.lotId !== lot.id || item.status !== 'completed') continue;
    const previous = bySleeper.get(item.sleeperId);
    if (!previous || (item.completedAt || item.updatedAt) >= (previous.completedAt || previous.updatedAt)) bySleeper.set(item.sleeperId, item);
  }
  const inspections = [...bySleeper.values()];
  const completed = inspections.length;
  const approved = inspections.filter((item) => item.evaluation === 'approved').length;
  const rejected = inspections.filter((item) => item.evaluation === 'rejected').length;
  return { completed, approved, rejected, unclassified: completed - approved - rejected, pending: Math.max(0, lot.total - completed), progress: Math.round(completed / lot.total * 100) };
}

export function finishLot(id: string) {
  return mutate(async (store) => {
    await authorizeLot(id, 'inspect');
    const lot = store.lots.find((item) => item.id === id);
    if (!lot || lot.status === 'finished' || lotMetrics(store, lot).pending > 0) throw new Error('Conclua todas as inspeções antes de finalizar o lote.');
    lot.status = 'finished'; lot.finishedAt = new Date().toISOString();
    return lot;
  });
}

export async function loadOperationalStore() {
  if (!backendConfigured) return readStore();
  return mutate(async (store) => {
    const lots = await api<Lot[]>('/lots'); // Only lots authorized by the server.
    if (!Array.isArray(lots)) throw new Error('Resposta de lotes inválida.');
    store.lots = lots;
    return store;
  });
}

export type SleeperRecord = { id: string; number: number; lot: Lot; history: Inspection[] };
export function sleeperRecord(store: Store, id: string): SleeperRecord | null {
  const lot = store.lots.find((item) => id.startsWith(`${item.code}-D`));
  if (!lot) return null;
  const number = Number(id.slice(lot.code.length + 2));
  if (!Number.isInteger(number) || number < 1 || number > lot.total || id !== `${lot.code}-D${String(number).padStart(4, '0')}`) return null;
  return { id, number, lot, history: store.inspections.filter((item) => item.sleeperId === id && item.lotId === lot.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

export async function resolveIdentifier(raw: string, source: 'qr' | 'nfc') {
  // Strict identifiers only. Never deserialize tag JSON, navigate to arbitrary URLs or accept roles from tags.
  const value = raw.trim();
  const id = value.startsWith('raillog:sleeper:') ? value.slice(16) : value.startsWith('raillog:lot:') ? value.slice(12) : value;
  const isSleeper = /^LT-\d+-D\d{4,}$/.test(id);
  if (!isSleeper && (source === 'nfc' || !/^LT-\d+$/.test(id))) throw new Error('Identificador não reconhecido. Use uma etiqueta RailLog cadastrada.');
  const store = await loadOperationalStore();
  const sleeper = isSleeper ? sleeperRecord(store, id) : null;
  const lot = sleeper?.lot || (!isSleeper ? store.lots.find((item) => item.code === id) : null);
  if (!lot) throw new Error('Etiqueta desconhecida: o dormente ou lote não está no armazenamento disponível para esta sessão.');
  await authorizeLot(lot.id, 'read');
  return { lot, sleeper };
}

export function beginSleeperInspection(sleeperId: string, operatorId: string) {
  return mutate(async (store) => {
    const sleeper = sleeperRecord(store, sleeperId);
    if (!sleeper) throw new Error('Dormente não encontrado no lote de origem.');
    await authorizeLot(sleeper.lot.id, 'inspect');
    const draft = sleeper.history.find((item) => item.status === 'in_progress');
    if (draft) return draft;
    const now = new Date().toISOString();
    const inspection: Inspection = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      kind: sleeper.history.length || sleeper.lot.status === 'finished' ? 'occurrence' : 'initial',
      lotId: sleeper.lot.id, sleeperId, sleeperNumber: sleeper.number, operatorId,
      material: sleeper.lot.predominantMaterial, condition: null, cracks: null, humidity: null,
      residualYears: null, step: 'diagnosis', status: 'in_progress', evaluation: null,
      createdAt: now, updatedAt: now,
    };
    store.inspections.push(inspection);
    if (sleeper.lot.status === 'waiting') sleeper.lot.status = 'inspection';
    return inspection;
  });
}
