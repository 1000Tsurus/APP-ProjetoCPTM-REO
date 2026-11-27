// Fluxo comum de "Salvar" das telas de campo: grava na fila e tenta enviar na hora.
import type { Href, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { enqueue, listOutbox, type NewOutboxItem } from './outbox';
import { syncNow } from './sync';

/**
 * Grava o item na fila (sempre) e tenta sincronizar. Devolve a mensagem para o operador:
 * só diz "enviado" se o item realmente saiu da fila; rejeitado mostra o motivo.
 */
export async function saveToQueue(userId: string, item: NewOutboxItem): Promise<string> {
  await enqueue(userId, item);
  try {
    await syncNow(userId);
  } catch {
    // Falha no envio não perde nada: o item já está na fila.
  }
  const left = (await listOutbox(userId)).find((i) => i.client_uuid === item.client_uuid);
  if (!left) return 'Registrado — enviado';
  if (left.status === 'rejected') {
    return `Registrado, mas rejeitado pelo servidor: ${left.reason ?? 'motivo não informado'}`;
  }
  return 'Registrado — aguardando envio';
}

/** Mostra o resultado e volta à tela anterior (ou a `fallback` se não houver histórico). */
export function finishAndLeave(router: ReturnType<typeof useRouter>, message: string, fallback: Href): void {
  const leave = () => (router.canGoBack() ? router.back() : router.replace(fallback));
  Alert.alert(message, undefined, [{ text: 'OK', onPress: leave }], { cancelable: false });
}
