import { supabase } from "../../../lib/supabase";
import { captureHandledException } from "../../../lib/sentry";
import {
  emitImmediateAchievementAwards,
  type ImmediateAchievementAward,
} from "../../achievements/immediateAwardsBus";
import type { Json } from "../../../types/database";

export type GameplayEventInput = {
  type: string;
  conventionId?: string | null;
  payload?: Json | null;
  occurredAt?: string | Date;
  idempotencyKey?: string;
};

export type GameplayEventResult = {
  eventId: string;
  awards: AchievementAward[];
};

export type AchievementAward = ImmediateAchievementAward & {
  userId: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const generateIdempotencyKey = () =>
  `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const normalizeAwards = (raw: unknown): AchievementAward[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const awards: AchievementAward[] = [];

  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }

    const achievementKey =
      typeof entry.achievement_key === "string" && entry.achievement_key.length > 0
        ? entry.achievement_key
        : null;

    const awarded = entry.awarded !== false;

    if (!achievementKey || !awarded) {
      continue;
    }

    const achievementId =
      typeof entry.achievement_id === "string" && entry.achievement_id.length > 0
        ? entry.achievement_id
        : null;
    const userId =
      typeof entry.user_id === "string" && entry.user_id.length > 0 ? entry.user_id : null;
    const awardedAt =
      typeof entry.awarded_at === "string" && entry.awarded_at.length > 0
        ? entry.awarded_at
        : null;
    const sourceEventId =
      typeof entry.source_event_id === "string" && entry.source_event_id.length > 0
        ? entry.source_event_id
        : null;
    const context = isRecord(entry.context) ? (entry.context as Json) : null;

    awards.push({
      achievementId,
      achievementKey,
      awardedAt,
      context,
      sourceEventId,
      userId,
    });
  }

  return awards;
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

  try {
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();

    const body = {
      type,
      convention_id: input.conventionId ?? null,
      payload: input.payload ?? {},
      occurred_at: normalizeOccurredAt(input.occurredAt),
      idempotency_key: idempotencyKey,
    };

    const { data, error } = await supabase.functions.invoke<{
      event_id: string;
      awards?: unknown;
    }>("events-ingress", { body });

    if (error) {
      throw error;
    }

    if (!data || typeof data.event_id !== "string") {
      throw new Error("events-ingress response missing event_id");
    }

    const awards = normalizeAwards(data.awards);

    if (awards.length > 0) {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData.session?.user.id ?? null;
      if (currentUserId) {
        const ownAwards = awards
          .filter((award) => award.userId === currentUserId)
          .map(({ userId: _ignored, ...rest }) => rest);
        if (ownAwards.length > 0) {
          emitImmediateAchievementAwards({
            userId: currentUserId,
            awards: ownAwards,
          });
        }
      }
    }

    return {
      eventId: data.event_id,
      awards,
    };
  } catch (error) {
    captureHandledException(error, {
      scope: "events.emitGameplayEvent",
      type,
      conventionId: input.conventionId ?? null,
    });
    return null;
  }
}
