// Demonstration snapshot; replace with the authenticated operations API when available.
// Only the manager's backend may change the goal. The inspector consumes it read-only.
export const operationalGoal = { completed: 5, target: 6, assignedBy: 'Gestão operacional' };
export const volumeSummary = { approved: 1080, rejected: 120, pending: 50, shift: 'Turno A', unit: 'dormentes' };

export const analysisCategories = [
  { id: 'dormentes', title: 'Dormentes', description: 'Madeira / Concreto', icon: 'reader-outline' },
  { id: 'trilhos', title: 'Trilhos e AMVs', description: 'Geometria e alinhamento', icon: 'git-branch-outline' },
  { id: 'fixacoes', title: 'Fixações', description: 'Grampos e tirafundos', icon: 'hammer-outline' },
  { id: 'outros', title: 'Outros', description: 'Lastro e sinalização', icon: 'ellipsis-horizontal' },
] as const;
export type AnalysisCategory = typeof analysisCategories[number]['id'];
export type Inspection = {
  id: string;
  lot: string;
  category: AnalysisCategory;
  status: 'approved' | 'rejected';
  description: string;
  time: string;
  icon: 'warning-outline' | 'checkmark' | 'construct-outline';
};
export const recentInspections: Inspection[] = [
  { id: 'DRM-000214', lot: 'LT-002', category: 'dormentes', status: 'rejected', description: 'Fissura longitudinal', time: '10:42', icon: 'warning-outline' },
  { id: 'DRM-000213', lot: 'LT-002', category: 'dormentes', status: 'approved', description: 'Conforme padrão ABNT', time: '10:39', icon: 'checkmark' },
  { id: 'DRM-000212', lot: 'LT-002', category: 'dormentes', status: 'approved', description: 'Conforme padrão ABNT', time: '10:35', icon: 'checkmark' },
  { id: 'DRM-000211', lot: 'LT-001', category: 'dormentes', status: 'rejected', description: 'Desgaste de apoio', time: '10:28', icon: 'construct-outline' },
];
