// Tipos do contrato da API, espelhando app/schemas e app/models/enums.py.
// UUIDs e datas (UTC, ISO 8601) chegam como string.

export type Role = 'operador' | 'tecnico' | 'especialista' | 'supervisor' | 'admin';
export type SleeperStatus = 'in_stock' | 'withdrawn' | 'in_track' | 'quarantine' | 'discarded';
export type MovementKind = 'entry' | 'withdrawal' | 'transfer';
export type ConservationState = 'good' | 'fair' | 'poor';
export type MoistureLevel = 'dry' | 'moist' | 'wet';
export type InspectionResult = 'approved' | 'rejected';
export type OccurrenceKind = 'damage' | 'loss' | 'misplaced' | 'other';
export type LocationKind = 'warehouse' | 'street';
export type SyncItemStatus = 'accepted' | 'duplicate' | 'rejected';
export type SyncBatchStatus = 'completed' | 'partial' | 'failed';
export type SyncItemType = 'movement' | 'inspection' | 'occurrence' | 'inventory_count';

export type ApiErrorBody = {
  detail: string;
  code: string;
  errors?: { loc: (string | number)[]; msg: string }[];
};

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

export type UserRead = {
  id: string;
  name: string;
  email: string;
  registration: string;
  role: Role;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_at: string;
  refresh_expires_at: string;
  user: UserRead;
};

export type SpeciesSummary = {
  id: string;
  code: string;
  scientific_name: string | null;
  common_name: string | null;
};

export type SpeciesRead = SpeciesSummary & {
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type LocationSummary = {
  id: string;
  name: string;
  kind: LocationKind;
  parent_id: string | null;
};

export type LocationRead = LocationSummary & {
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SleeperRead = {
  id: string;
  rfid_tag: string;
  registration_record: string | null;
  species: SpeciesSummary | null;
  wood_class: string | null;
  // Decimal na API: pode chegar como string ("2.80") ou número.
  length_m: string | number | null;
  treatment: string | null;
  supplier: string | null;
  inspection_company: string | null;
  manufacture_year: number | null;
  status: SleeperStatus;
  current_location: LocationSummary | null;
  created_at: string;
  updated_at: string;
};

export type SleeperCreate = {
  rfid_tag: string;
  location_id: string;
  species_id?: string | null;
  registration_record?: string | null;
  wood_class?: string | null;
  length_m?: string | number | null;
  treatment?: string | null;
  supplier?: string | null;
  inspection_company?: string | null;
  manufacture_year?: number | null;
  occurred_at?: string | null;
  client_uuid?: string | null;
};

/** Referência ao dormente: informar `rfid_tag` ou `sleeper_id`. */
export type SleeperRef = { rfid_tag?: string | null; sleeper_id?: string | null };

export type MovementRead = {
  id: string;
  sleeper_id: string;
  kind: MovementKind;
  from_location_id: string | null;
  to_location_id: string | null;
  requisition_number: string | null;
  notes: string | null;
  user_id: string;
  occurred_at: string;
  client_uuid: string | null;
  created_at: string;
};

export type InspectionRead = {
  id: string;
  sleeper_id: string;
  inspector_id: string;
  inspected_at: string;
  conservation: ConservationState;
  has_cracks: boolean;
  biological_attack: boolean;
  moisture: MoistureLevel;
  estimated_life_years: number | null;
  species_confirmed: boolean | null;
  species_corrected_id: string | null;
  notes: string | null;
  result: InspectionResult;
  duration_seconds: number | null;
  client_uuid: string | null;
  created_at: string;
};

export type OccurrenceRead = {
  id: string;
  sleeper_id: string | null;
  location_id: string;
  kind: OccurrenceKind;
  description: string;
  user_id: string;
  occurred_at: string;
  client_uuid: string | null;
  created_at: string;
};

export type HistoryEntry = {
  type: 'movement' | 'inspection' | 'occurrence';
  occurred_at: string;
  movement?: MovementRead | null;
  inspection?: InspectionRead | null;
  occurrence?: OccurrenceRead | null;
};

export type SleeperHistory = { sleeper: SleeperRead; items: HistoryEntry[] };

export type MovementCreate = SleeperRef & {
  kind: MovementKind;
  to_location_id?: string | null;
  requisition_number?: string | null;
  notes?: string | null;
  occurred_at?: string | null;
  client_uuid?: string | null;
};

export type InspectionCreate = SleeperRef & {
  conservation: ConservationState;
  has_cracks: boolean;
  biological_attack: boolean;
  moisture: MoistureLevel;
  result: InspectionResult;
  inspected_at?: string | null;
  estimated_life_years?: number | null;
  species_confirmed?: boolean | null;
  species_corrected_id?: string | null;
  notes?: string | null;
  duration_seconds?: number | null;
  client_uuid?: string | null;
};

export type OccurrenceCreate = {
  kind: OccurrenceKind;
  description: string;
  rfid_tag?: string | null;
  sleeper_id?: string | null;
  location_id?: string | null;
  occurred_at?: string | null;
  client_uuid?: string | null;
};

export type SyncItemResult = {
  type: SyncItemType;
  index: number;
  client_uuid: string | null;
  status: SyncItemStatus;
  id?: string | null;
  code?: string | null;
  reason?: string | null;
};

export type SyncBatchRead = {
  id: string;
  device_id: string | null;
  received_at: string;
  total: number;
  accepted: number;
  duplicate: number;
  rejected: number;
  status: SyncBatchStatus;
  results: SyncItemResult[];
};

export type SyncStatusRead = { last_batch: SyncBatchRead | null; server_time: string };
