// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions run in Deno.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import {
  evaluateCatchAchievements,
  evaluateMetaAchievements,
  evaluateProfileAchievements,
  evaluateSimpleEventAchievements,
  type AwardCandidate,
  type CatchEventContext,
  type ProfileEventContext,
  type SimpleEventContext,
} from "../../../packages/achievement-rules/src/index.ts";
import {
  processDailyTasksForEvent,
  type DailyTaskCompletion,
} from "./dailyTasks.ts";
import type { InsertableEventRow, Json } from "./types.ts";

const DAILY_TASK_ACHIEVEMENT_PREFIX = "DAILY_TASK_";
const PROFILE_AVATAR_BUCKET = "profile-avatars";
const PROFILE_AVATAR_PUBLIC_PATH = `/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/`;

type RpcAwardResult = {
  achievement_key: string;
  achievement_id?: string | null;
  user_id: string;
  awarded: boolean;
  context?: Record<string, unknown> | null;
  awarded_at?: string | null;
  source_event_id?: string | null;
  reason?: string | null;
};

type NotificationInsert = {
  user_id: string;
  type: string;
  payload: Json;
};

export type ProcessedAchievementResult = {
  awards: RpcAwardResult[];
};

const MAX_QUERY_LIMIT = 20000;

function hasUploadedProfileAvatar(avatarUrl: unknown): boolean {
  if (typeof avatarUrl !== "string") {
    return false;
  }

  const trimmed = avatarUrl.trim();
  return trimmed.length > 0 && trimmed.includes(PROFILE_AVATAR_PUBLIC_PATH);
}

/**
 * Generate a UUID v7 (time-ordered UUID).
 * Used for creating new event IDs when inserting catch_performed events.
 */
function generateUuidV7(): string {
  const now = BigInt(Date.now());
  const random = crypto.getRandomValues(new Uint8Array(10));
  const bytes = new Uint8Array(16);

  bytes[0] = Number((now >> 40n) & 0xffn);
  bytes[1] = Number((now >> 32n) & 0xffn);
  bytes[2] = Number((now >> 24n) & 0xffn);
  bytes[3] = Number((now >> 16n) & 0xffn);
  bytes[4] = Number((now >> 8n) & 0xffn);
  bytes[5] = Number(now & 0xffn);

  bytes.set(random, 6);

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // Version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant RFC 4122

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type ProcessCatchEventOptions = {
  skipDailyTasks?: boolean;
};

export async function processAchievementsForEvent(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  event: InsertableEventRow,
): Promise<ProcessedAchievementResult> {
  // Idempotency guard: skip if already processed by a concurrent caller.
  const { data: existing } = await supabaseAdmin
    .from("events")
    .select("processed_at")
    .eq("event_id", event.event_id)
    .single();
  if (existing?.processed_at) {
    return { awards: [] };
  }

  switch (event.type) {
    case "catch_performed":
      return await processCatchEvent(supabaseAdmin, event);
    case "catch_pending":
      // No achievements for pending catches
      return { awards: [] };
    case "catch_confirmed":
      return await processCatchConfirmedEvent(supabaseAdmin, event);
    case "catch_rejected":
    case "catch_expired":
      // No achievements for rejected or expired catches
      return { awards: [] };
    case "profile_updated":
      return await processProfileEvent(supabaseAdmin, event);
    case "onboarding_completed":
      return await processSimpleEvent(supabaseAdmin, event, "onboarding_completed");
    case "convention_joined":
      return await processSimpleEvent(supabaseAdmin, event, "convention_joined");
    case "leaderboard_refreshed":
    case "catch_shared":
    case "fursuit_bio_viewed":
      return await processDailyTaskOnlyEvent(supabaseAdmin, event);
    default:
      return { awards: [] };
  }
}

async function processCatchEvent(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  event: InsertableEventRow,
  options: ProcessCatchEventOptions = {},
): Promise<ProcessedAchievementResult> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const catchIdValue = payload["catch_id"];
  const catchId = typeof catchIdValue === "string" ? catchIdValue : null;
  if (!catchId) {
    return { awards: [] };
  }

  const catchRow = await fetchCatchWithRelations(supabaseAdmin, catchId);
  if (!catchRow) {
    return { awards: [] };
  }

  const catcherId = catchRow.catcher_id ?? event.user_id;
  const fursuitId = catchRow.fursuit_id ?? null;

  if (!catcherId || !fursuitId) {
    return { awards: [] };
  }

  const catchFursuit = Array.isArray(catchRow.fursuit) ? catchRow.fursuit[0] : catchRow.fursuit;
  const rawOwnerId = catchFursuit?.owner_id ?? null;
  const tutorialValue = payload["is_tutorial"];
  const payloadTutorialFlag =
    tutorialValue === true ||
    (typeof tutorialValue === "string" && tutorialValue === "true");
  const wasTutorialCatch = catchRow.is_tutorial === true || payloadTutorialFlag;
  if (wasTutorialCatch) {
    return { awards: [] };
  }

  const candidateConventionIds = collectConventionIds(event, payload, catchRow.convention_id);
  const uniqueConventionIds = candidateConventionIds.filter(
    (value, index, self) => self.indexOf(value) === index,
  );
  const primaryConventionId = uniqueConventionIds[0] ?? null;

  // Batch fetch ALL convention infos at once (avoids N+1)
  const conventionInfoMap = new Map<string, ConventionInfo | null>();
  if (uniqueConventionIds.length > 0) {
    const allInfos = await Promise.all(
      uniqueConventionIds.map((id) => fetchConventionInfo(supabaseAdmin, id).catch(() => null)),
    );
    uniqueConventionIds.forEach((id, index) => {
      conventionInfoMap.set(id, allInfos[index] ?? null);
    });
  }

  // Primary convention info is first in the map
  const conventionInfo = primaryConventionId ? conventionInfoMap.get(primaryConventionId) ?? null : null;

  const fursuitOwnerId = rawOwnerId && rawOwnerId !== catcherId ? rawOwnerId : null;
  const occurredAt =
    typeof catchRow.caught_at === "string" && catchRow.caught_at.length > 0
      ? catchRow.caught_at
      : event.occurred_at;

  // gather stats
  const [totalCatches, totalFursuitCatches, distinctSpecies, distinctConventions,
    uniqueCatchersForFursuitLifetime, distinctConventionsForFursuit] = await Promise.all([
    countCatchesByUser(supabaseAdmin, catcherId),
    fursuitOwnerId ? countCatchesByFursuit(supabaseAdmin, fursuitId, true) : Promise.resolve(0),
    countDistinctSpeciesCaught(supabaseAdmin, catcherId),
    countDistinctConventionsForUser(supabaseAdmin, catcherId),
    fursuitOwnerId ? countUniqueCatchersForFursuitLifetime(supabaseAdmin, fursuitId) : Promise.resolve(0),
    fursuitOwnerId ? countDistinctConventionsForFursuit(supabaseAdmin, fursuitId) : Promise.resolve(0),
  ]);

  const [isHybrid, hasDoubleCatch] = await Promise.all([
    hasHybridOrMultiSpecies(supabaseAdmin, fursuitId),
    hasSecondCatchWithinMinute(supabaseAdmin, catcherId, occurredAt),
  ]);

  let catchesAtConvention = 0;
  let uniqueCatchersAtConvention = 0;
  if (primaryConventionId) {
    const stats = await fetchCatchEventsForFursuitAtConvention(
      supabaseAdmin,
      fursuitId,
      primaryConventionId,
    );
    catchesAtConvention = stats.totalCatches;
    uniqueCatchersAtConvention = stats.uniqueCatchers;
  }

  const localParts =
    primaryConventionId && conventionInfo
      ? toLocalParts(occurredAt, conventionInfo.timezone)
      : null;
  const isConventionDayOne =
    Boolean(primaryConventionId) &&
    Boolean(conventionInfo?.startDate) &&
    Boolean(localParts) &&
    conventionInfo?.startDate === localParts?.date;
  const isLateNight = localParts ? localParts.hour >= 22 : false;
  const isEarlyMorning = localParts ? localParts.hour < 9 : false;
  const catchHasPhoto = Boolean((catchRow as Record<string, unknown>).catch_photo_url);

  const conventionTimezone = conventionInfo?.timezone ?? "UTC";
  const [distinctLocalDaysForFursuitAtConvention, catchesByCatcherToday] = await Promise.all([
    fursuitOwnerId && primaryConventionId
      ? countDistinctLocalDaysForFursuitAtConvention(
          supabaseAdmin,
          fursuitId,
          primaryConventionId,
          conventionTimezone,
        )
      : Promise.resolve(0),
    primaryConventionId && localParts
      ? countAcceptedCatchesByCatcherOnDate(
          supabaseAdmin,
          catcherId,
          primaryConventionId,
          conventionTimezone,
          localParts.date,
        )
      : Promise.resolve(0),
  ]);

  const catchContext: CatchEventContext = {
    eventId: event.event_id,
    occurredAt,
    catchId,
    catcherId,
    actingUserId: event.user_id ?? catcherId,
    fursuitId,
    fursuitOwnerId,
    conventionId: primaryConventionId,
    conventionInfo,
    isTutorial: wasTutorialCatch,
    timing: {
      isConventionDayOne,
      isLateNight,
      isEarlyMorning,
    },
    stats: {
      totalCatches,
      totalFursuitCatches,
      distinctSpeciesCaught: distinctSpecies,
      distinctConventionsVisited: distinctConventions,
      catchesAtConvention,
      uniqueCatchersAtConvention,
      uniqueCatchersForFursuitLifetime,
      distinctLocalDaysForFursuitAtConvention,
      distinctConventionsForFursuit,
      catchesByCatcherToday,
    },
    flags: {
      hybridFursuit: isHybrid,
      doubleCatchWithinMinute: hasDoubleCatch,
      catchHasPhoto,
    },
  };

  const awards = evaluateCatchAchievements(catchContext);

  const conventionAwards = primaryConventionId
    ? await evaluateConventionAchievements(supabaseAdmin, primaryConventionId, "catch_performed", catchContext)
    : [];

  // Process daily tasks for the catcher
  let catcherDailyAwards: AwardCandidate[] = [];
  let ownerDailyAwards: AwardCandidate[] = [];
  if (!options.skipDailyTasks) {
    catcherDailyAwards = await collectDailyTaskAwardsFromCatch({
      event,
      userId: catcherId,
      occurredAt,
      conventionIds: uniqueConventionIds,
      conventionInfoMap,
    });

    // Also process daily tasks for the fursuit owner (if different from catcher)
    // Both the catcher and owner should receive daily task credit when a suit is caught
    if (fursuitOwnerId && fursuitOwnerId !== catcherId) {
      ownerDailyAwards = await collectDailyTaskAwardsFromCatch({
        event,
        userId: fursuitOwnerId,
        occurredAt,
        conventionIds: uniqueConventionIds,
        conventionInfoMap,
      });
    }
  }

  const combinedAwards = [...awards, ...conventionAwards, ...catcherDailyAwards, ...ownerDailyAwards];
  const mainResult = await applyAwards(supabaseAdmin, combinedAwards, event);

  // Post-award meta pass: check ACHIEVEMENT_HUNTER after main batch is granted
  const anyGranted = mainResult.awards.some((r) => r.awarded);
  if (anyGranted) {
    const metaCandidates: AwardCandidate[] = [];

    const catcherTotal = await countRealAchievementsForUser(supabaseAdmin, catcherId);
    metaCandidates.push(...evaluateMetaAchievements(catcherId, catcherTotal));

    if (fursuitOwnerId && fursuitOwnerId !== catcherId) {
      const ownerTotal = await countRealAchievementsForUser(supabaseAdmin, fursuitOwnerId);
      metaCandidates.push(...evaluateMetaAchievements(fursuitOwnerId, ownerTotal));
    }

    if (metaCandidates.length > 0) {
      const metaResult = await applyAwards(supabaseAdmin, metaCandidates, event);
      return { awards: [...mainResult.awards, ...metaResult.awards] };
    }
  }

  return mainResult;
}

async function processCatchConfirmedEvent(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  event: InsertableEventRow,
): Promise<ProcessedAchievementResult> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const catchIdValue = payload["catch_id"];
  const catchId = typeof catchIdValue === "string" ? catchIdValue : null;

  if (!catchId) {
    console.error("[events-ingress] catch_confirmed event missing catch_id");
    return { awards: [] };
  }

  const catchRow = await fetchCatchWithRelations(supabaseAdmin, catchId);
  if (!catchRow) {
    console.error("[events-ingress] catch_confirmed event: catch not found", { catchId });
    return { awards: [] };
  }

  if (catchRow.status !== "ACCEPTED") {
    console.warn("[events-ingress] catch_confirmed event ignored for non-accepted catch", {
      catchId,
      status: catchRow.status,
    });
    return { awards: [] };
  }

  const { data: existingCatchPerformed, error: existingCatchPerformedError } = await supabaseAdmin
    .from("events")
    .select("event_id")
    .eq("type", "catch_performed")
    .eq("user_id", event.user_id)
    .contains("payload", { catch_id: catchId })
    .limit(1)
    .maybeSingle();

  if (existingCatchPerformedError) {
    console.error("[events-ingress] Failed checking existing catch_performed event", {
      catchId,
      error: existingCatchPerformedError,
    });
  } else if (existingCatchPerformed?.event_id) {
    // confirm_catch now emits catch_performed directly on accept.
    // Skip synthetic insertion to avoid double-counting daily tasks and achievements.
    return { awards: [] };
  }

  // For daily tasks, always use the confirmation date (not the original catch date)
  // This means if a catch is made on Monday and approved on Tuesday,
  // it counts toward Tuesday's daily tasks
  console.log("[events-ingress] catch_confirmed: processing for confirmation date", {
    catchId,
    caughtAt: catchRow.caught_at,
    confirmedAt: event.occurred_at,
  });

  const catchFursuit = Array.isArray(catchRow.fursuit) ? catchRow.fursuit[0] : catchRow.fursuit;

  // Create the catch_performed event that will be inserted into the database.
  // This is necessary because daily task processing queries the events table
  // for catch_performed events - without this insert, daily tasks won't update.
  const catchPerformedEvent: InsertableEventRow = {
    event_id: generateUuidV7(),
    user_id: event.user_id,
    type: "catch_performed",
    convention_id: event.convention_id,
    payload: {
      catch_id: catchId,
      fursuit_id: catchRow.fursuit_id,
      fursuit_owner_id: catchFursuit?.owner_id ?? null,
      status: "ACCEPTED",
      is_tutorial: false,
      source: "catch_confirmed",
      species: catchFursuit?.species?.name ?? null,
      colors: (catchFursuit?.color_assignments ?? [])
        .map((a: { color: { name: string } | null }) => a.color?.name)
        .filter((n: string | undefined): n is string => !!n),
    },
    occurred_at: event.occurred_at, // Use confirmation timestamp
  };

  const { error: insertError } = await supabaseAdmin
    .from("events")
    .insert([catchPerformedEvent]);

  if (insertError) {
    console.error("[events-ingress] Failed to insert catch_performed event", {
      catchId,
      error: insertError,
    });
    // Continue with processing even if insert fails - achievements should still work
  } else {
    console.log("[events-ingress] Inserted catch_performed event for daily tasks", {
      event_id: catchPerformedEvent.event_id,
      catch_id: catchId,
    });
  }

  // Process achievements and daily tasks using the catch_performed event
  const result = await processCatchEvent(supabaseAdmin, catchPerformedEvent, { skipDailyTasks: false });

  // This synthetic catch_performed row is processed inline here (not via queue),
  // so stamp it to avoid leaving unprocessed rows with no queue metadata.
  if (!insertError) {
    const now = new Date().toISOString();
    const { error: stampError } = await supabaseAdmin
      .from("events")
      .update({
        retry_count: 0,
        processed_at: now,
        last_attempted_at: now,
        last_error: null,
      })
      .eq("event_id", catchPerformedEvent.event_id)
      .is("processed_at", null);

    if (stampError) {
      console.error("[events-ingress] Failed to stamp synthetic catch_performed event", {
        event_id: catchPerformedEvent.event_id,
        catch_id: catchId,
        error: stampError,
      });
    }
  }

  return result;
}

async function processProfileEvent(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  event: InsertableEventRow,
): Promise<ProcessedAchievementResult> {
  const userId = event.user_id;
  const profile = await fetchProfileSnapshot(supabaseAdmin, userId);
  if (!profile) {
    return { awards: [] };
  }

  const context: ProfileEventContext = {
    eventId: event.event_id,
    occurredAt: event.occurred_at,
    userId,
    profile,
  };

  const awards = evaluateProfileAchievements(context);
  return await applyAwards(supabaseAdmin, awards, event);
}

async function processSimpleEvent(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  event: InsertableEventRow,
  eventType: "onboarding_completed" | "convention_joined",
): Promise<ProcessedAchievementResult> {
  const context: SimpleEventContext = {
    eventId: event.event_id,
    occurredAt: event.occurred_at,
    userId: event.user_id,
    conventionId: event.convention_id,
  };

  const awards = evaluateSimpleEventAchievements(eventType, context);

  const conventionAwards = eventType === "convention_joined" && context.conventionId
    ? await evaluateConventionAchievements(supabaseAdmin, context.conventionId, "convention_joined", context)
    : [];

  return await applyAwards(supabaseAdmin, [...awards, ...conventionAwards], event);
}

async function processDailyTaskOnlyEvent(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  event: InsertableEventRow,
): Promise<ProcessedAchievementResult> {
  const userId = event.user_id;
  if (!userId) {
    return { awards: [] };
  }
  const conventionId = resolveConventionIdFromEvent(event);
  if (!conventionId) {
    return { awards: [] };
  }
  const conventionInfo = await fetchConventionInfo(supabaseAdmin, conventionId).catch(() => null);
  try {
    const result = await processDailyTasksForEvent({
      event,
      userId,
      conventionId,
      conventionInfo,
    });
    const awards = result.completions.map(buildDailyTaskAward);
    return await applyAwards(supabaseAdmin, awards, event);
  } catch (error) {
    console.error("[events-ingress] Failed processing daily tasks", {
      event_id: event.event_id,
      error,
    });
    return { awards: [] };
  }
}

async function collectDailyTaskAwardsFromCatch(options: {
  event: InsertableEventRow;
  userId: string;
  occurredAt: string;
  conventionIds: string[];
  conventionInfoMap: Map<string, ConventionInfo | null>;
}): Promise<AwardCandidate[]> {
  const awards: AwardCandidate[] = [];
  for (const conventionId of options.conventionIds) {
    if (!conventionId) continue;
    const conventionInfo = options.conventionInfoMap.get(conventionId) ?? null;
    try {
      const result = await processDailyTasksForEvent({
        event: options.event,
        userId: options.userId,
        conventionId,
        conventionInfo,
        occurredAt: options.occurredAt,
      });
      awards.push(...result.completions.map(buildDailyTaskAward));
    } catch (error) {
      console.error("[events-ingress] Failed processing daily tasks for catch", {
        event_id: options.event.event_id,
        convention_id: conventionId,
        error,
      });
    }
  }
  return awards;
}

function buildDailyTaskAward(completion: DailyTaskCompletion): AwardCandidate {
  const windowKey = `daily:${completion.conventionId}:${completion.day}:${completion.taskId}`;
  return {
    achievementKey: `${DAILY_TASK_ACHIEVEMENT_PREFIX}${completion.taskId}`,
    userId: completion.userId,
    context: {
      convention_id: completion.conventionId,
      day: completion.day,
      task_id: completion.taskId,
      task_name: completion.taskName,
      requirement: completion.requirement,
    },
    windowKey,
  };
}

function resolveConventionIdFromEvent(event: InsertableEventRow): string | null {
  if (event.convention_id && event.convention_id.length > 0) {
    return event.convention_id;
  }
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const payloadConventionId =
    typeof payload.convention_id === "string" && payload.convention_id.length > 0
      ? payload.convention_id
      : null;
  if (payloadConventionId) {
    return payloadConventionId;
  }
  const conventionIdsValue = payload.convention_ids;
  if (Array.isArray(conventionIdsValue)) {
    for (const value of conventionIdsValue) {
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

async function evaluateConventionAchievements(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  conventionId: string,
  triggerEvent: string,
  context: CatchEventContext | SimpleEventContext,
): Promise<AwardCandidate[]> {
  const { data, error } = await supabaseAdmin
    .from("achievements")
    .select("key, achievement_rules(kind, rule)")
    .eq("convention_id", conventionId)
    .eq("trigger_event", triggerEvent)
    .eq("is_active", true);

  if (error) {
    console.error("[events-ingress] Failed fetching convention achievements", {
      conventionId,
      triggerEvent,
      error,
    });
    return [];
  }

  const candidates: AwardCandidate[] = [];

  for (const row of data ?? []) {
    const ruleRow = (row.achievement_rules as unknown as { kind: string; rule: Record<string, unknown> } | null);
    if (!ruleRow) continue;

    const { kind, rule } = ruleRow;

    if (triggerEvent === "catch_performed") {
      const catchCtx = context as CatchEventContext;

      if (kind === "fursuit_caught_count_at_convention") {
        const threshold = typeof rule?.threshold === "number" ? rule.threshold : 0;
        if (
          catchCtx.fursuitOwnerId &&
          catchCtx.stats.uniqueCatchersAtConvention >= threshold
        ) {
          candidates.push({
            achievementKey: row.key,
            userId: catchCtx.fursuitOwnerId,
            context: { convention_id: conventionId },
          });
        }
      }
    } else if (triggerEvent === "convention_joined") {
      const simpleCtx = context as SimpleEventContext;

      if (kind === "convention_joined") {
        candidates.push({
          achievementKey: row.key,
          userId: simpleCtx.userId,
          context: { convention_id: conventionId },
        });
      }
    }
  }

  return candidates;
}

async function applyAwards(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  awards: AwardCandidate[],
  event: InsertableEventRow,
): Promise<ProcessedAchievementResult> {
  if (awards.length === 0) {
    return { awards: [] };
  }

  const payload = awards.map((award) => ({
    user_id: award.userId,
    achievement_key: award.achievementKey,
    context: award.context ?? {},
    occurred_at: event.occurred_at,
    source_event_id: event.event_id,
    ...(award.windowKey ? { window_key: award.windowKey } : {}),
  }));

  const { data, error } = await supabaseAdmin.rpc("grant_achievements_batch", {
    awards: payload,
  });

  if (error) {
    console.error("[events-ingress] grant_achievements_batch failed", {
      event_id: event.event_id,
      error,
    });
    return { awards: [] };
  }

  const results = (data ?? []) as RpcAwardResult[];
  await insertNotificationsForAwards(supabaseAdmin, results);

  return { awards: results };
}

async function insertNotificationsForAwards(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  results: RpcAwardResult[],
) {
  const notifications: NotificationInsert[] = [];
  for (const summary of results) {
    if (!summary.awarded || !summary.achievement_id) {
      continue;
    }
    notifications.push({
      user_id: summary.user_id,
      type: "achievement_awarded",
      payload: {
        achievement_id: summary.achievement_id,
        achievement_key: summary.achievement_key,
        awarded_at: summary.awarded_at,
        context: summary.context ?? {},
        source_event_id: summary.source_event_id ?? null,
      },
    });
  }

  if (notifications.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("notifications")
    .insert(notifications);

  if (error) {
    console.error("[events-ingress] Failed inserting notifications", { error });
  }
}

function collectConventionIds(
  event: InsertableEventRow,
  payload: Record<string, unknown>,
  catchConventionId: string | null,
): string[] {
  const ids: string[] = [];
  if (typeof catchConventionId === "string" && catchConventionId.length > 0) {
    ids.push(catchConventionId);
  }
  const payloadConventionIdValue = payload["convention_id"];
  const payloadConventionId =
    typeof payloadConventionIdValue === "string" ? payloadConventionIdValue : null;
  if (payloadConventionId) {
    ids.push(payloadConventionId);
  }
  const conventionIdsValue = payload["convention_ids"];
  if (Array.isArray(conventionIdsValue)) {
    for (const entry of conventionIdsValue) {
      if (typeof entry === "string" && entry.length > 0) {
        ids.push(entry);
      } else if (typeof entry === "number" && Number.isFinite(entry)) {
        ids.push(String(entry));
      }
    }
  }
  if (typeof event.convention_id === "string" && event.convention_id.length > 0) {
    ids.push(event.convention_id);
  }

  return ids
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .filter((value, index, self) => self.indexOf(value) === index);
}

async function fetchCatchWithRelations(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  catchId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("catches")
    .select("id,catcher_id,fursuit_id,convention_id,is_tutorial,status,caught_at,catch_photo_url,fursuit:fursuits(id,owner_id,species_id,species:fursuit_species(name),color_assignments:fursuit_color_assignments(color:fursuit_colors(name)))")
    .eq("id", catchId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[events-ingress] Failed loading catch row", { catchId, error });
    return null;
  }
  return data;
}

async function countCatchesByUser(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  userId: string,
) {
  const { count, error } = await supabaseAdmin
    .from("catches")
    .select("id", { count: "exact", head: true })
    .eq("catcher_id", userId)
    .eq("is_tutorial", false)
    .eq("status", "ACCEPTED");
  if (error) {
    console.error("[events-ingress] Failed counting catches for user", { userId, error });
    return 0;
  }
  return count ?? 0;
}

async function countCatchesByFursuit(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  fursuitId: string,
  excludeTutorials: boolean,
) {
  let query = supabaseAdmin
    .from("catches")
    .select("id", { count: "exact", head: true })
    .eq("fursuit_id", fursuitId)
    .eq("status", "ACCEPTED");
  if (excludeTutorials) {
    query = query.eq("is_tutorial", false);
  }
  const { count, error } = await query;
  if (error) {
    console.error("[events-ingress] Failed counting catches for fursuit", { fursuitId, error });
    return 0;
  }
  return count ?? 0;
}

async function countDistinctSpeciesCaught(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  userId: string,
) {
  // Optimized: Use SQL aggregation instead of fetching all rows
  const { data, error } = await supabaseAdmin
    .rpc("count_distinct_species_caught", { user_id: userId });

  if (error) {
    console.error("[events-ingress] Failed counting species", { userId, error });
    return 0;
  }

  return data ?? 0;
}

async function hasHybridOrMultiSpecies(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  fursuitId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("fursuits")
    .select("species_id")
    .eq("id", fursuitId)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("[events-ingress] Failed fetching fursuit metadata", { fursuitId, error });
    }
    return false;
  }

  if (data.species_id) {
    const { data: speciesRows, error: speciesError } = await supabaseAdmin
      .from("fursuit_species")
      .select("name,normalized_name")
      .eq("id", data.species_id)
      .limit(1)
      .maybeSingle();
    if (speciesError) {
      console.error("[events-ingress] Failed loading species metadata", {
        fursuitId,
        species_id: data.species_id,
        error: speciesError,
      });
    } else if (speciesRows) {
      const name =
        (speciesRows.normalized_name ?? speciesRows.name ?? "").toString().toLowerCase();
      if (name.includes("hybrid")) {
        return true;
      }
    }
  }

  const { data: mapRows, error: mapError } = await supabaseAdmin
    .from("fursuit_species_map")
    .select("species_id")
    .eq("fursuit_id", fursuitId)
    .limit(MAX_QUERY_LIMIT);

  if (mapError) {
    console.error("[events-ingress] Failed loading fursuit species map", { fursuitId, error: mapError });
    return false;
  }

  const ids = new Set<string>();
  for (const row of mapRows ?? []) {
    if (row.species_id) ids.add(row.species_id);
  }
  return ids.size > 1;
}

async function hasSecondCatchWithinMinute(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  userId: string,
  occurredAtIso: string,
) {
  const occurredAt = new Date(occurredAtIso);
  const windowStart = new Date(occurredAt.getTime() - 60_000).toISOString();
  const windowEnd = occurredAt.toISOString();

  const { data, error } = await supabaseAdmin
    .from("catches")
    .select("id,is_tutorial,caught_at")
    .eq("catcher_id", userId)
    .eq("status", "ACCEPTED")
    .gte("caught_at", windowStart)
    .lte("caught_at", windowEnd)
    .order("caught_at", { ascending: true });

  if (error) {
    console.error("[events-ingress] Failed checking double catch window", { userId, error });
    return false;
  }

  return (data ?? []).filter((row) => row.is_tutorial !== true).length >= 2;
}

async function fetchCatchEventsForFursuitAtConvention(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  fursuitId: string,
  conventionId: string,
) {
  // Optimized: Use SQL aggregation to get counts directly
  const { data, error } = await supabaseAdmin
    .rpc("get_fursuit_convention_stats", {
      p_fursuit_id: fursuitId,
      p_convention_id: conventionId,
    });

  if (error) {
    console.error("[events-ingress] Failed fetching convention catches", {
      fursuitId,
      conventionId,
      error,
    });
    return { totalCatches: 0, uniqueCatchers: 0 };
  }

  // RPC returns a single row with total_catches and unique_catchers
  const stats = (data ?? [])[0];
  return {
    totalCatches: Number(stats?.total_catches ?? 0),
    uniqueCatchers: Number(stats?.unique_catchers ?? 0),
  };
}

async function countDistinctConventionsForUser(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  userId: string,
) {
  // Optimized: Use SQL aggregation instead of fetching all rows
  const { data, error } = await supabaseAdmin
    .rpc("count_distinct_conventions", { user_id: userId });

  if (error) {
    console.error("[events-ingress] Failed counting conventions for user", { userId, error });
    return 0;
  }

  return data ?? 0;
}

async function fetchConventionInfo(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  conventionId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("conventions")
    .select("start_date,timezone")
    .eq("id", conventionId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[events-ingress] Failed fetching convention info", { conventionId, error });
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    startDate: data.start_date ?? null,
    timezone: data.timezone ?? "UTC",
  };
}

type ConventionInfo = {
  startDate: string | null;
  timezone: string | null;
};

async function fetchProfileSnapshot(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  userId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("avatar_url,username,bio")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[events-ingress] Failed loading profile snapshot", { userId, error });
    return null;
  }
  if (!data) {
    return null;
  }
  return {
    hasAvatar: hasUploadedProfileAvatar(data.avatar_url),
    hasUsername: Boolean(data.username && data.username.trim().length > 0),
    hasBio: Boolean(data.bio && data.bio.trim().length > 0),
  };
}

async function countUniqueCatchersForFursuitLifetime(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  fursuitId: string,
) {
  const { data, error } = await supabaseAdmin
    .rpc("count_unique_catchers_for_fursuit_lifetime", { p_fursuit_id: fursuitId });
  if (error) {
    console.error("[events-ingress] Failed counting lifetime catchers for fursuit", { fursuitId, error });
    return 0;
  }
  return Number(data ?? 0);
}

async function countDistinctLocalDaysForFursuitAtConvention(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  fursuitId: string,
  conventionId: string,
  timezone: string,
) {
  const { data, error } = await supabaseAdmin
    .rpc("count_distinct_local_days_for_fursuit_at_convention", {
      p_fursuit_id: fursuitId,
      p_convention_id: conventionId,
      p_timezone: timezone,
    });
  if (error) {
    console.error("[events-ingress] Failed counting distinct days for fursuit at convention", {
      fursuitId,
      conventionId,
      error,
    });
    return 0;
  }
  return Number(data ?? 0);
}

async function countDistinctConventionsForFursuit(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  fursuitId: string,
) {
  const { data, error } = await supabaseAdmin
    .rpc("count_distinct_conventions_for_fursuit", { p_fursuit_id: fursuitId });
  if (error) {
    console.error("[events-ingress] Failed counting distinct conventions for fursuit", { fursuitId, error });
    return 0;
  }
  return Number(data ?? 0);
}

async function countAcceptedCatchesByCatcherOnDate(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  catcherId: string,
  conventionId: string,
  timezone: string,
  date: string,
) {
  const { data, error } = await supabaseAdmin
    .rpc("count_accepted_catches_by_catcher_on_date", {
      p_catcher_id: catcherId,
      p_convention_id: conventionId,
      p_timezone: timezone,
      p_date: date,
    });
  if (error) {
    console.error("[events-ingress] Failed counting catches by catcher on date", {
      catcherId,
      conventionId,
      date,
      error,
    });
    return 0;
  }
  return Number(data ?? 0);
}

async function countRealAchievementsForUser(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  userId: string,
) {
  const { data, error } = await supabaseAdmin
    .rpc("count_real_achievements_for_user", { p_user_id: userId });
  if (error) {
    console.error("[events-ingress] Failed counting real achievements for user", { userId, error });
    return 0;
  }
  return Number(data ?? 0);
}

function toLocalParts(iso: string, timeZone: string | null | undefined) {
  const tz = timeZone && timeZone.length > 0 ? timeZone : "UTC";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(iso));
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    hour: Number.parseInt(lookup.hour ?? "0", 10),
    minute: Number.parseInt(lookup.minute ?? "0", 10),
  };
}
