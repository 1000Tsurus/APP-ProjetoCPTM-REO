// Tipos do contrato da API. Nesta etapa, só os enums de domínio (valores
// idênticos a app/models/enums.py da API); o restante entra na integração.

export type Role = 'operador' | 'tecnico' | 'especialista' | 'supervisor' | 'admin';
export type SleeperStatus = 'in_stock' | 'withdrawn' | 'in_track' | 'quarantine' | 'discarded';
export type MovementKind = 'entry' | 'withdrawal' | 'transfer';
export type ConservationState = 'good' | 'fair' | 'poor';
export type MoistureLevel = 'dry' | 'moist' | 'wet';
export type InspectionResult = 'approved' | 'rejected';
export type OccurrenceKind = 'damage' | 'loss' | 'misplaced' | 'other';
