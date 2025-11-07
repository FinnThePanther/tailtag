export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export type EventRecord = {
  event_id: string;
  user_id: string;
  type: string;
  convention_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
};

export type QueueMessage = {
  event: EventRecord;
  received_at: string;
};

export type CatchRow = {
  id: string;
  catcher_id: string;
  fursuit_id: string;
  convention_id: string | null;
  caught_at: string | null;
  is_tutorial?: boolean | null;
  fursuit?: { owner_id?: string | null } | null;
};

export type ConventionInfo = {
  startDate: string | null;
  timezone: string | null;
};
