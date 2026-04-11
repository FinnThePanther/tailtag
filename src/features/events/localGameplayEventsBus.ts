import type { Json } from '../../types/database';

export type LocalGameplayEvent = {
  eventId: string;
  idempotencyKey: string;
  type: string;
  conventionId: string | null;
  occurredAt: string;
  payload: Json;
  emittedAt: number;
};

type LocalGameplayEventListener = (event: LocalGameplayEvent) => void;

const listeners = new Set<LocalGameplayEventListener>();

export function subscribeToLocalGameplayEvents(listener: LocalGameplayEventListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitLocalGameplayEvent(event: LocalGameplayEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error('[local-gameplay-events] listener error', error);
    }
  }
}
