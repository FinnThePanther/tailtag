import { supabase } from "../../../lib/supabase";
import { captureHandledException } from "../../../lib/sentry";

type Json = Record<string, unknown>;

export type GameplayEventInput = {
  type: string;
  conventionId?: string | null;
  payload?: Json | null;
  occurredAt?: string | Date;
};

export type GameplayEventResult = {
  eventId: string;
  forwarded: boolean;
  forwardStatus: number | null;
  forwardError: string | null;
};

const normalizeOccurredAt = (input: GameplayEventInput["occurredAt"]) => {
  if (!input) {
    return new Date().toISOString();
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

/**
 * Emit a gameplay event into the Supabase → Cloudflare ingestion pipeline.
 * Returns `null` when the request fails so callers can degrade gracefully
 * without interrupting the primary UX flow (e.g. catching a suit).
 */
export async function emitGameplayEvent(
  input: GameplayEventInput,
): Promise<GameplayEventResult | null> {
  const type = input.type.trim();

  if (!type) {
    captureHandledException(
      new Error("Missing gameplay event type"),
      { scope: "events.emitGameplayEvent", input },
    );
    return null;
  }

  const metadata = {
    scope: "events.emitGameplayEvent",
    type,
    conventionId: input.conventionId ?? null,
  } as const;

  try {
    const body = {
      type,
      convention_id: input.conventionId ?? null,
      payload: input.payload ?? {},
      occurred_at: normalizeOccurredAt(input.occurredAt),
    };

    const { data, error } = await supabase.functions.invoke<{
      event_id: string;
      forwarded: boolean;
      forward_status: number | null;
      forward_error: string | null;
    }>("events-ingress", { body });

    if (error) {
      throw error;
    }

    if (!data || typeof data.event_id !== "string") {
      throw new Error("events-ingress response missing event_id");
    }

    return {
      eventId: data.event_id,
      forwarded: Boolean(data.forwarded),
      forwardStatus: typeof data.forward_status === "number" ? data.forward_status : null,
      forwardError: typeof data.forward_error === "string" ? data.forward_error : null,
    };
  } catch (error) {
    captureHandledException(error, metadata);
    return null;
  }
}
