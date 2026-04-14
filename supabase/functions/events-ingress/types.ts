export type Json = Record<string, unknown>;

export type EventRequestBody = {
  type?: unknown;
  convention_id?: unknown;
  payload?: unknown;
  occurred_at?: unknown;
  catch_id?: unknown;
  idempotency_key?: unknown;
  user_id?: unknown; // For service role authenticated requests
};

export type InsertableEventRow = {
  event_id: string;
  user_id: string;
  type: string;
  convention_id: string | null;
  payload: Json;
  occurred_at: string;
};
