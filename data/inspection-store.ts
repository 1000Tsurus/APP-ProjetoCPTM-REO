import AsyncStorage from '@react-native-async-storage/async-storage';

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
type Store = { version: 1; lots: Lot[]; inspections: Inspection[]; evidence: Evidence[] };
const KEY = 'cptm.raillog.inspections.v1';
const empty = (): Store => ({ version: 1, lots: [], inspections: [], evidence: [] });
let queue: Promise<unknown> = Promise.resolve();

export async function readStore(): Promise<Store> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return empty();
  const parsed = JSON.parse(raw) as Store;
  if (parsed.version !== 1 || !Array.isArray(parsed.lots) || !Array.isArray(parsed.inspections) || !Array.isArray(parsed.evidence)) {
    throw new Error('Os dados locais de inspeção precisam de recuperação.');
  }
  return parsed;
}

function mutate<T>(operation: (store: Store) => T | Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    const store = await readStore();
    const value = await operation(store);
    await AsyncStorage.setItem(KEY, JSON.stringify(store));
    return value;
  });
  queue = result.catch(() => undefined);
  return result;
}

export function createLot(input: Omit<Lot, 'id' | 'code' | 'createdAt' | 'status'>, start: boolean) {
  return mutate((store) => {
    const next = store.lots.reduce((max, lot) => Math.max(max, Number(lot.code.match(/^LT-(\d+)$/)?.[1]) || 0), 0) + 1;
    const code = `LT-${String(next).padStart(3, '0')}`;
    if (store.lots.some((lot) => lot.code === code)) throw new Error('Código de lote já existente.');
    const lot: Lot = { ...input, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, code, createdAt: new Date().toISOString(), status: start ? 'inspection' : 'waiting' };
    store.lots.push(lot);
    return lot;
  });
}

export function startLot(lotId: string) {
  return mutate((store) => {
    const lot = store.lots.find((item) => item.id === lotId);
    if (!lot || lot.status === 'finished') throw new Error('Lote indisponível para inspeção.');
    lot.status = 'inspection';
    return lot;
  });
}

export function getOrCreateCurrentInspection(lotId: string, operatorId: string) {
  return mutate((store) => {
    const lot = store.lots.find((item) => item.id === lotId);
    if (!lot || lot.status === 'finished') throw new Error('Lote indisponível para inspeção.');
    let inspection = store.inspections.find((item) => item.lotId === lotId && item.status === 'in_progress');
    if (inspection) return inspection;
    const completedNumbers = new Set(store.inspections.filter((item) => item.lotId === lotId && item.status === 'completed').map((item) => item.sleeperNumber));
    const next = Array.from({ length: lot.total }, (_, index) => index + 1).find((number) => !completedNumbers.has(number));
    if (!next) return null;
    const now = new Date().toISOString();
    inspection = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
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
  return mutate((store) => {
    const item = store.inspections.find((inspection) => inspection.id === id);
    if (!item || item.status === 'completed') throw new Error('Esta inspeção não pode mais ser alterada.');
    Object.assign(item, changes, { updatedAt: new Date().toISOString() });
    return item;
  });
}

export function saveEvidence(inspectionId: string, category: PhotoCategory, uri: string) {
  return mutate((store) => {
    const inspection = store.inspections.find((item) => item.id === inspectionId);
    if (!inspection || inspection.status === 'completed') throw new Error('Esta inspeção não pode mais ser alterada.');
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
  return mutate((store) => {
    const item = store.inspections.find((inspection) => inspection.id === id);
    if (!item || item.status === 'completed') throw new Error('Inspeção indisponível para conclusão.');
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
  const inspections = store.inspections.filter((item) => item.lotId === lot.id && item.status === 'completed');
  const completed = inspections.length;
  const approved = inspections.filter((item) => item.evaluation === 'approved').length;
  const rejected = inspections.filter((item) => item.evaluation === 'rejected').length;
  return { completed, approved, rejected, unclassified: completed - approved - rejected, pending: Math.max(0, lot.total - completed), progress: Math.round(completed / lot.total * 100) };
}

export function finishLot(id: string) {
  return mutate((store) => {
    const lot = store.lots.find((item) => item.id === id);
    if (!lot || lot.status === 'finished' || lotMetrics(store, lot).pending > 0) throw new Error('Conclua todas as inspeções antes de finalizar o lote.');
    lot.status = 'finished'; lot.finishedAt = new Date().toISOString();
    return lot;
  });
}
