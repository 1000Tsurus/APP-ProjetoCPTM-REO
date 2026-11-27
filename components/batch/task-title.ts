import type { BatchTask } from '@/data/batch';
import { OCCURRENCE_KIND } from '@/data/labels';

/** Título da tarefa no topo da leitura, na linguagem do operador. */
export function taskTitle(task: BatchTask): string {
  switch (task.kind) {
    case 'receive':
      return `Receber em ${task.locationName}`;
    case 'transfer':
      return `Transferir para ${task.locationName}`;
    case 'withdraw':
      return `Retirar · RM ${task.requisitionNumber}`;
    case 'occurrence':
      return `Ocorrência · ${OCCURRENCE_KIND[task.occurrenceKind]}`;
  }
}
