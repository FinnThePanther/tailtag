// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions run in Deno.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import {
  evaluateCatchAchievements,
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

export async function processAchievementsForEvent(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  event: InsertableEventRow,
): Promise<ProcessedAchievementResult> {
  try {
    switch (event.type) {
      case "catch_performed":
        return await processCatchEvent(supabaseAdmin, event);
      case "catch_confirmed":
        // Process achievements when a catch is confirmed after manual approval
        return await processCatchConfirmedEvent(supabaseAdmin, event);
      case "catch_pending":
        // No achievements for pending catches
        return { awards: [] };
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
  } catch (error) {
    console.error("[events-ingress] Failed processing achievements", {
      event_id: event.event_id,
      type: event.type,
      error,
    });
    return { awards: [] };
  }
}

async function processCatchEvent(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  event: InsertableEventRow,
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

  const rawOwnerId = catchRow.fursuit?.owner_id ?? null;
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
  const conventionInfoMap = new Map<string, ConventionInfo | null>();
  let conventionInfo: ConventionInfo | null = null;
  if (primaryConventionId) {
    conventionInfo = await fetchConventionInfo(supabaseAdmin, primaryConventionId);
    conventionInfoMap.set(primaryConventionId, conventionInfo);
  }
  const otherConventionIds = uniqueConventionIds.filter((id) => id !== primaryConventionId);
  if (otherConventionIds.length > 0) {
    const otherInfos = await Promise.all(
      otherConventionIds.map((id) => fetchConventionInfo(supabaseAdmin, id).catch(() => null)),
    );
    otherConventionIds.forEach((id, index) => {
      conventionInfoMap.set(id, otherInfos[index] ?? null);
    });
  }

  const fursuitOwnerId = rawOwnerId && rawOwnerId !== catcherId ? rawOwnerId : null;
  const occurredAt =
    typeof catchRow.caught_at === "string" && catchRow.caught_at.length > 0
      ? catchRow.caught_at
      : event.occurred_at;

  // gather stats
  const [totalCatches, totalFursuitCatches, distinctSpecies, distinctConventions] = await Promise.all([
    countCatchesByUser(supabaseAdmin, catcherId),
    fursuitOwnerId ? countCatchesByFursuit(supabaseAdmin, fursuitId, true) : Promise.resolve(0),
    countDistinctSpeciesCaught(supabaseAdmin, catcherId),
    countDistinctConventionsForUser(supabaseAdmin, catcherId),
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
    },
    stats: {
      totalCatches,
      totalFursuitCatches,
      distinctSpeciesCaught: distinctSpecies,
      distinctConventionsVisited: distinctConventions,
      catchesAtConvention,
      uniqueCatchersAtConvention,
    },
    flags: {
      hybridFursuit: isHybrid,
      doubleCatchWithinMinute: hasDoubleCatch,
    },
  };

  const awards = evaluateCatchAchievements(catchContext);

  const dailyAwards = await collectDailyTaskAwardsFromCatch({
    event,
    userId: catcherId,
    occurredAt,
    conventionIds: uniqueConventionIds,
    conventionInfoMap,
  });

  const combinedAwards = [...awards, ...dailyAwards];
  return await applyAwards(supabaseAdmin, combinedAwards, event);
}

async function processCatchConfirmedEvent(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  event: InsertableEventRow,
): Promise<ProcessedAchievementResult> {
  // When a catch is confirmed, process it as a normal catch event
  // The catch_id should be in the payload
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const catchIdValue = payload["catch_id"];
  const catchId = typeof catchIdValue === "string" ? catchIdValue : null;

  if (!catchId) {
    console.error("[events-ingress] catch_confirmed event missing catch_id");
    return { awards: [] };
  }

  // Update the event type to catch_performed for processing
  // This allows us to reuse all the existing catch processing logic
  const catchEvent = {
    ...event,
    type: "catch_performed" as const,
  };

  return await processCatchEvent(supabaseAdmin, catchEvent);
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
  return await applyAwards(supabaseAdmin, awards, event);
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
    .insert(notifications, { returning: "minimal" });

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
    .select("id,catcher_id,fursuit_id,convention_id,is_tutorial,caught_at,fursuit:fursuits(id,owner_id,species,species_id)")
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
    .eq("is_tutorial", false);
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
    .eq("fursuit_id", fursuitId);
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
    .select("species,species_id")
    .eq("id", fursuitId)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("[events-ingress] Failed fetching fursuit metadata", { fursuitId, error });
    }
    return false;
  }

  if (typeof data.species === "string" && data.species.toLowerCase().includes("hybrid")) {
    return true;
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
    .select("username,bio,avatar_url")
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
    hasUsername: Boolean(data.username && data.username.trim().length > 0),
    hasBio: Boolean(data.bio && data.bio.trim().length > 0),
    hasAvatar: Boolean(data.avatar_url && data.avatar_url.trim().length > 0),
  };
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
