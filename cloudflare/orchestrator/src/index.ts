import { handleDailyResetEvent, processDailyTasksForEvent } from "./dailyTasks";
import { supabaseFetch } from "./supabaseClient";
import type { CatchRow, ConventionInfo, Env, EventRecord, QueueMessage } from "./types";

/**
 * Cloudflare Worker: orchestrator
 *
 * Processes gameplay events from the Cloudflare Queue and applies all
 * achievement logic directly, bypassing the legacy Supabase processor.
 *
 * Responsibilities:
 * - Evaluate catch events and grant FIRST_CATCH / DEBUT_PERFORMANCE.
 * - Grant onboarding/profile/convention achievements.
 * - Write rows to `user_achievements`, `user_awards`, `awards_log`, and
 *   `notifications` so the client receives realtime toasts.
 */

type AchievementAwardSummary = {
  key: string;
  userId: string;
  awarded: boolean;
  context?: Record<string, unknown> | null;
  achievementId?: string | null;
  awardedAt?: string | null;
  sourceEventId?: string | null;
  reason?: string | null;
};

type CatchEventRecord = {
  user_id: string | null;
  payload: Record<string, unknown> | null;
};

const MAX_RETRY_DELAY_SECONDS = 300;
const BASE_RETRY_DELAY_SECONDS = 5;
const ACHIEVEMENT_CACHE_TTL_MS = 5 * 60 * 1000;

let achievementCache: Map<string, { id: string; key: string; rule_id: string | null }> | null = null;
let achievementCacheExpiresAt = 0;

let conventionCache: Map<string, ConventionInfo> | null = null;
let conventionCacheExpiresAt = 0;
const CONVENTION_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  if (typeof error === "object" && error !== null) {
    try {
      return {
        message: JSON.stringify(error),
      };
    } catch {
      return {
        message: String(error),
      };
    }
  }

  return { message: String(error) };
}

async function fetchCatchWithRelations(env: Env, catchId: string): Promise<CatchRow | null> {
  const params = new URLSearchParams({
    select:
      "id,catcher_id,fursuit_id,convention_id,is_tutorial,caught_at,fursuit:fursuits(id,owner_id)",
    id: `eq.${catchId}`,
    limit: "1",
  });

  const response = await supabaseFetch(env, `/rest/v1/catches?${params.toString()}`);
  const data = (await response.json()) as CatchRow[] | null;
  return data?.[0] ?? null;
}

function isUndefinedColumnError(error: unknown): boolean {
  return error instanceof Error && /"code":"42703"/.test(error.message);
}

async function countCatchesByUser(env: Env, userId: string): Promise<number> {
  try {
    const response = await supabaseFetch(
      env,
      `/rest/v1/catches?catcher_id=eq.${encodeURIComponent(userId)}&is_tutorial=eq.false`,
      {
        method: "HEAD",
        headers: {
          Prefer: "count=exact",
        },
      }
    );

    const contentRange = response.headers.get("content-range");
    if (!contentRange) return 0;
    const parts = contentRange.split("/");
    if (parts.length !== 2) return 0;
    const total = Number.parseInt(parts[1], 10);
    return Number.isNaN(total) ? 0 : total;
  } catch (error) {
    console.error("[orchestrator] Failed counting catches for user", { userId, error });
    return 0;
  }
}

async function countCatchesByFursuit(env: Env, fursuitId: string): Promise<number> {
  try {
    const response = await supabaseFetch(
      env,
      `/rest/v1/catches?fursuit_id=eq.${encodeURIComponent(fursuitId)}`,
      {
        method: "HEAD",
        headers: {
          Prefer: "count=exact",
        },
      }
    );

    const contentRange = response.headers.get("content-range");
    if (!contentRange) return 0;
    const parts = contentRange.split("/");
    if (parts.length !== 2) return 0;
    const total = Number.parseInt(parts[1], 10);
    return Number.isNaN(total) ? 0 : total;
  } catch (error) {
    console.error("[orchestrator] Failed counting catches for fursuit", { fursuitId, error });
    return 0;
  }
}

async function countDistinctSpeciesCaught(env: Env, userId: string): Promise<number> {
  try {
    const response = await supabaseFetch(
      env,
      `/rest/v1/catches?select=is_tutorial,fursuit:fursuits(species_id,species)&catcher_id=eq.${encodeURIComponent(userId)}&order=caught_at.asc&limit=20000`,
    );
    const rows = (await response.json()) as {
      is_tutorial?: boolean | null;
      fursuit?: { species_id?: string | null; species?: string | null } | Record<string, never>;
    }[];
    const species = new Set<string>();

    for (const row of rows ?? []) {
      if (row.is_tutorial === true) continue;
      const relation = row.fursuit as { species_id?: string | null; species?: string | null } | null;
      if (!relation) continue;
      if (relation.species_id) {
        species.add(relation.species_id);
        continue;
      }
      if (relation.species) {
        species.add(relation.species.trim().toLowerCase());
      }
    }

    return species.size;
  } catch (error) {
    console.error("[orchestrator] Failed counting distinct species", { userId, error });
    return 0;
  }
}

async function hasHybridOrMultiSpecies(env: Env, fursuitId: string): Promise<boolean> {
  try {
    const response = await supabaseFetch(
      env,
      `/rest/v1/fursuits?select=species,species_id&id=eq.${encodeURIComponent(fursuitId)}&limit=1`,
    );
    const rows = (await response.json()) as { species?: string | null; species_id?: string | null }[];
    const record = rows?.[0];
    if (!record) return false;

    if (record.species && record.species.toLowerCase().includes("hybrid")) {
      return true;
    }

    if (record.species_id) {
      try {
        const speciesResponse = await supabaseFetch(
          env,
          `/rest/v1/fursuit_species?select=name,normalized_name&id=eq.${encodeURIComponent(record.species_id)}&limit=1`,
        );
        const speciesRows = (await speciesResponse.json()) as { name?: string | null; normalized_name?: string | null }[];
        const speciesRecord = speciesRows?.[0];
        if (speciesRecord) {
          const name = (speciesRecord.normalized_name ?? speciesRecord.name ?? "").toLowerCase();
          if (name.includes("hybrid")) {
            return true;
          }
        }
      } catch (speciesError) {
        if (!isUndefinedColumnError(speciesError)) {
          console.error("[orchestrator] Failed loading species metadata", {
            fursuitId,
            species_id: record.species_id,
            error: speciesError,
          });
        }
      }
    }

    try {
      const mapResponse = await supabaseFetch(
        env,
        `/rest/v1/fursuit_species_map?select=species_id&fursuit_id=eq.${encodeURIComponent(fursuitId)}&limit=200`,
      );
      const mapRows = (await mapResponse.json()) as { species_id?: string | null }[];
      const ids = new Set<string>();
      for (const row of mapRows ?? []) {
        if (row.species_id) ids.add(row.species_id);
      }
      if (ids.size > 1) {
        return true;
      }
    } catch (mapError) {
      if (!isUndefinedColumnError(mapError)) {
        console.error("[orchestrator] Failed checking species map", { fursuitId, error: mapError });
      }
    }

    return false;
  } catch (error) {
    console.error("[orchestrator] Failed loading fursuit metadata", { fursuitId, error });
    return false;
  }
}

async function countDistinctConventionsForUser(env: Env, userId: string): Promise<number> {
  const fallback = async () => {
    try {
      const response = await supabaseFetch(
        env,
        `/rest/v1/events?select=payload,user_id&type=eq.catch_performed&user_id=eq.${encodeURIComponent(userId)}&order=occurred_at.asc&limit=20000`,
      );
      const rows = (await response.json()) as { payload?: Record<string, unknown> | null }[];
      const conventions = new Set<string>();
      for (const row of rows ?? []) {
        const payload = row.payload ?? {};
        const isTutorial = payload?.is_tutorial === true || payload?.is_tutorial === "true";
        if (isTutorial) continue;
        const conventionId = typeof payload?.convention_id === "string"
          ? payload?.convention_id
          : Array.isArray(payload?.convention_ids) && payload?.convention_ids.length > 0
            ? String(payload?.convention_ids[0])
            : null;
        if (conventionId) {
          conventions.add(conventionId);
        }
      }
      return conventions.size;
    } catch (error) {
      console.error("[orchestrator] Failed counting conventions for user (fallback)", {
        userId,
        error,
      });
      return 0;
    }
  };

  try {
    const params = new URLSearchParams({
      select: "convention_id,is_tutorial",
      catcher_id: `eq.${userId}`,
      order: "caught_at.asc",
      limit: "20000",
    });
    const response = await supabaseFetch(env, `/rest/v1/catches?${params.toString()}`);
    const rows = (await response.json()) as {
      convention_id: string | null;
      is_tutorial?: boolean | null;
    }[];
    const conventions = new Set<string>();
    for (const row of rows ?? []) {
      if (row.is_tutorial === true) continue;
      if (row.convention_id) {
        conventions.add(row.convention_id);
      }
    }
    return conventions.size;
  } catch (error) {
    if (!isUndefinedColumnError(error)) {
      console.error("[orchestrator] Failed counting conventions for user (catches)", {
        userId,
        error,
      });
    }
    return fallback();
  }
}

async function fetchCatchRecordsForFursuitAtConvention(
  env: Env,
  fursuitId: string,
  conventionId: string,
): Promise<CatchEventRecord[] | null> {
  try {
    const params = new URLSearchParams({
      select: "catcher_id,is_tutorial",
      fursuit_id: `eq.${fursuitId}`,
      convention_id: `eq.${conventionId}`,
      limit: "20000",
    });
    const response = await supabaseFetch(env, `/rest/v1/catches?${params.toString()}`);
    const rows = (await response.json()) as { catcher_id: string | null; is_tutorial?: boolean | null }[];
    const normalized: CatchEventRecord[] = [];
    for (const row of rows ?? []) {
      if (!row.catcher_id) continue;
      normalized.push({
        user_id: row.catcher_id,
        payload: {
          is_tutorial: row.is_tutorial === true,
        },
      });
    }
    return normalized;
  } catch (error) {
    if (isUndefinedColumnError(error)) {
      return null;
    }
    console.error("[orchestrator] Failed loading catches for fursuit/convention (catches)", {
      fursuitId,
      conventionId,
      error,
    });
    return null;
  }
}

async function countCatchEventsForFursuitAtConvention(
  env: Env,
  fursuitId: string,
  conventionId: string,
): Promise<CatchEventRecord[]> {
  const catchRecords = await fetchCatchRecordsForFursuitAtConvention(env, fursuitId, conventionId);
  if (catchRecords && catchRecords.length > 0) {
    return catchRecords;
  }

  if (catchRecords !== null) {
    return [];
  }

  try {
    const filters = [
      `type=eq.catch_performed`,
      `select=user_id,payload`,
      `limit=20000`,
      `${encodeURIComponent("payload->>fursuit_id")}=eq.${encodeURIComponent(fursuitId)}`,
      `${encodeURIComponent("payload->>convention_id")}=eq.${encodeURIComponent(conventionId)}`,
    ];
    const path = `/rest/v1/events?${filters.join("&")}`;
    const response = await supabaseFetch(env, path);
    const rows = (await response.json()) as CatchEventRecord[];
    return rows ?? [];
  } catch (error) {
    console.error("[orchestrator] Failed loading catch events for fursuit/convention (events)", {
      fursuitId,
      conventionId,
      error,
    });
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _countCatchesForFursuitAtConvention(
  env: Env,
  fursuitId: string,
  conventionId: string,
): Promise<number> {
  const events = await countCatchEventsForFursuitAtConvention(env, fursuitId, conventionId);
  return events.filter((event) => {
    const payload = event.payload ?? {};
    return payload?.is_tutorial !== true && payload?.is_tutorial !== "true";
  }).length;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _countUniqueCatchersForFursuitAtConvention(
  env: Env,
  fursuitId: string,
  conventionId: string,
): Promise<number> {
  const events = await countCatchEventsForFursuitAtConvention(env, fursuitId, conventionId);
  const unique = new Set<string>();
  for (const event of events) {
    const payload = event.payload ?? {};
    if (payload?.is_tutorial === true || payload?.is_tutorial === "true") {
      continue;
    }
    if (event.user_id) {
      unique.add(event.user_id);
    }
  }
  return unique.size;
}

async function fetchConventionInfo(
  env: Env,
  conventionId: string,
): Promise<{ startDate: string | null; timezone: string | null } | null> {
  const now = Date.now();

  // Check cache
  if (conventionCache && now < conventionCacheExpiresAt) {
    const cached = conventionCache.get(conventionId);
    if (cached) {
      return cached;
    }
  } else if (!conventionCache || now >= conventionCacheExpiresAt) {
    conventionCache = new Map();
    conventionCacheExpiresAt = now + CONVENTION_CACHE_TTL_MS;
  }

  // Fetch from database
  try {
    const response = await supabaseFetch(
      env,
      `/rest/v1/conventions?select=start_date,timezone&id=eq.${encodeURIComponent(conventionId)}&limit=1`,
    );
    const rows = (await response.json()) as { start_date?: string | null; timezone?: string | null }[];
    const record = rows?.[0];
    if (!record) {
      return null;
    }
    const result = {
      startDate: record.start_date ?? null,
      timezone: record.timezone ?? "UTC",
    };

    // Cache the result
    conventionCache.set(conventionId, result);
    return result;
  } catch (error) {
    console.error("[orchestrator] Failed fetching convention info", {
      conventionId,
      error,
    });
    return null;
  }
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

async function hasSecondCatchWithinMinute(env: Env, userId: string, caughtAtIso: string): Promise<boolean> {
  const caughtAt = new Date(caughtAtIso);
  const windowStart = new Date(caughtAt.getTime() - 60_000).toISOString();
  const windowEnd = caughtAt.toISOString();

  try {
    const response = await supabaseFetch(
      env,
      `/rest/v1/catches?select=id,caught_at,is_tutorial&catcher_id=eq.${encodeURIComponent(userId)}&caught_at=gte.${encodeURIComponent(windowStart)}&caught_at=lte.${encodeURIComponent(windowEnd)}&order=caught_at.asc&limit=200`,
    );
    const rows = (await response.json()) as { is_tutorial?: boolean | null }[];
    return rows.filter((row) => row.is_tutorial !== true).length >= 2;
  } catch (error) {
    console.error("[orchestrator] Failed checking double trouble window", {
      userId,
      error,
    });
    return false;
  }
}


async function ensureAchievementCache(env: Env): Promise<Map<string, { id: string; key: string; rule_id: string | null }>> {
  const now = Date.now();
  if (achievementCache && now < achievementCacheExpiresAt) {
    return achievementCache;
  }

  const params = new URLSearchParams({
    select: "id,key,rule_id",
    is_active: "eq.true",
  });
  const response = await supabaseFetch(env, `/rest/v1/achievements?${params.toString()}`);
  const rows = (await response.json()) as { id: string; key: string; rule_id: string | null }[];

  const map = new Map<string, { id: string; key: string; rule_id: string | null }>();
  for (const row of rows ?? []) {
    if (row?.key && row?.id) {
      map.set(row.key, { id: row.id, key: row.key, rule_id: row.rule_id ?? null });
    }
  }

  achievementCache = map;
  achievementCacheExpiresAt = now + ACHIEVEMENT_CACHE_TTL_MS;
  return map;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _countRows(env: Env, path: string): Promise<number> {
  const response = await supabaseFetch(env, path, {
    method: "GET",
    headers: {
      Prefer: "count=exact",
      Range: "0-0",
    },
  });

  const contentRange = response.headers.get("content-range");
  await response.arrayBuffer().catch(() => {});

  if (!contentRange) return 0;
  const parts = contentRange.split("/");
  if (parts.length !== 2) return 0;
  const total = Number.parseInt(parts[1], 10);
  return Number.isNaN(total) ? 0 : total;
}

function buildAwardLookup(
  awards: {
    userId: string;
    achievementKey: string;
    context: Record<string, unknown>;
    occurredAt: string;
    sourceEventId: string;
  }[],
) {
  const lookup = new Map<string, {
    context: Record<string, unknown>;
    occurredAt: string;
    sourceEventId: string;
  }>();

  for (const award of awards) {
    const key = `${award.userId}:${award.achievementKey}`;
    lookup.set(key, {
      context: award.context,
      occurredAt: award.occurredAt,
      sourceEventId: award.sourceEventId,
    });
  }

  return lookup;
}

async function sendAchievementNotifications(
  env: Env,
  summaries: AchievementAwardSummary[],
  awards: {
    userId: string;
    achievementKey: string;
    context: Record<string, unknown>;
    occurredAt: string;
    sourceEventId: string;
  }[],
): Promise<void> {
  const awardLookup = buildAwardLookup(awards);
  const achievementMap = await ensureAchievementCache(env);

  const notifications = [] as {
    user_id: string;
    type: string;
    payload: Record<string, unknown>;
  }[];

  for (const summary of summaries) {
    if (!summary.awarded) {
      continue;
    }

    const achievementMeta = achievementMap.get(summary.key);
    const achievementId = summary.achievementId ?? achievementMeta?.id ?? null;

    if (!achievementId) {
      console.warn("[orchestrator] Skipping notification: missing achievement id", {
        achievement_key: summary.key,
        user_id: summary.userId,
      });
      continue;
    }

    const awardKey = `${summary.userId}:${summary.key}`;
    const originalAward = awardLookup.get(awardKey);

    const awardedAt = summary.awardedAt ?? originalAward?.occurredAt ?? new Date().toISOString();
    const context = summary.context ?? originalAward?.context ?? null;
    const sourceEventId = summary.sourceEventId ?? originalAward?.sourceEventId ?? null;

    notifications.push({
      user_id: summary.userId,
      type: "achievement_awarded",
      payload: {
        achievement_id: achievementId,
        achievement_key: summary.key,
        awarded_at: awardedAt,
        context,
        source_event_id: sourceEventId,
      },
    });
  }

  if (notifications.length === 0) {
    return;
  }

  try {
    await supabaseFetch(env, "/rest/v1/notifications", {
      method: "POST",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify(notifications),
    });

    console.info("[orchestrator] Inserted achievement notifications", {
      count: notifications.length,
    });
  } catch (error) {
    console.error("[orchestrator] Failed inserting achievement notifications", {
      count: notifications.length,
      error: describeError(error),
    });
  }
}

async function grantAchievementsBatch(
  env: Env,
  awards: {
    userId: string;
    achievementKey: string;
    context: Record<string, unknown>;
    occurredAt: string;
    sourceEventId: string;
  }[],
): Promise<AchievementAwardSummary[]> {
  if (awards.length === 0) {
    return [];
  }

  // Format awards for RPC call
  const rpcPayload = awards.map((award) => ({
    user_id: award.userId,
    achievement_key: award.achievementKey,
    context: award.context,
    occurred_at: award.occurredAt,
    source_event_id: award.sourceEventId,
  }));

  try {
    const response = await supabaseFetch(env, "/rest/v1/rpc/grant_achievements_batch", {
      method: "POST",
      body: JSON.stringify({ awards: rpcPayload }),
    });

    type RpcResult = {
      achievement_key: string;
      user_id: string;
      awarded: boolean;
      context?: Record<string, unknown> | null;
      reason?: string | null;
      achievement_id?: string | null;
      awarded_at?: string | null;
      source_event_id?: string | null;
    };

    const rawResults = (await response.json()) as RpcResult[];
    const hasNotificationFields = rawResults.some((entry) =>
      Object.prototype.hasOwnProperty.call(entry, "achievement_id"),
    );

    const summaries = rawResults.map((result) => ({
      key: result.achievement_key,
      userId: result.user_id,
      awarded: result.awarded,
      context: result.context ?? null,
      reason: result.reason ?? null,
      achievementId: result.achievement_id ?? null,
      awardedAt: result.awarded_at ?? null,
      sourceEventId: result.source_event_id ?? null,
    } satisfies AchievementAwardSummary));

    const granted = summaries.filter((summary) => summary.awarded).length;
    const failed = summaries.length - granted;

    console.info("[orchestrator] Batch processed achievements", {
      total: awards.length,
      granted,
      failed,
      failed_details: summaries
        .filter((summary) => !summary.awarded)
        .map((summary) => ({ key: summary.key, reason: summary.reason ?? null })),
    });

    if (hasNotificationFields) {
      await sendAchievementNotifications(env, summaries, awards);
    }

    return summaries;
  } catch (error) {
    console.error("[orchestrator] Failed batch processing achievements", {
      error: describeError(error),
      count: awards.length,
    });
    return [];
  }
}

async function handleCatchPerformed(env: Env, event: EventRecord) {
  const startTime = Date.now();
  const payload = event.payload ?? {};
  const catchId = typeof payload.catch_id === "string" ? payload.catch_id : null;

  if (!catchId) {
    console.warn("[orchestrator] catch_performed missing catch_id", {
      event_id: event.event_id,
    });
    return;
  }

  const catchRow = await fetchCatchWithRelations(env, catchId);
  if (!catchRow) {
    console.warn("[orchestrator] Catch row not found for catch_performed", {
      event_id: event.event_id,
      catch_id: catchId,
    });
    return;
  }

  console.info("[orchestrator] catch row data", {
    catch_id: catchId,
    catcher_id: catchRow.catcher_id,
    fursuit_id: catchRow.fursuit_id,
    fursuit_owner_id: catchRow.fursuit?.owner_id ?? null,
  });

  const catcherId = catchRow.catcher_id ?? event.user_id;
  const fursuitId = catchRow.fursuit_id ?? null;

  if (!catcherId || !fursuitId) {
    console.warn("[orchestrator] Catch row incomplete for catch_performed", {
      event_id: event.event_id,
      catch_id: catchId,
    });
    return;
  }

  const rawOwnerId = catchRow.fursuit?.owner_id ?? null;
  const payloadTutorialFlag =
    payload.is_tutorial === true || payload.is_tutorial === "true";
  const wasTutorialCatch = catchRow.is_tutorial === true || payloadTutorialFlag;

  const candidateConventionIds: string[] = [];
  if (typeof catchRow.convention_id === "string" && catchRow.convention_id.length > 0) {
    candidateConventionIds.push(catchRow.convention_id);
  }
  if (Array.isArray(payload.convention_ids)) {
    for (const value of payload.convention_ids) {
      if (typeof value === "string" && value.length > 0) {
        candidateConventionIds.push(value);
      } else if (typeof value === "number" && Number.isFinite(value)) {
        candidateConventionIds.push(String(value));
      }
    }
  }
  if (typeof payload.convention_id === "string" && payload.convention_id.length > 0) {
    candidateConventionIds.push(payload.convention_id);
  }
  if (typeof event.convention_id === "string" && event.convention_id.length > 0) {
    candidateConventionIds.push(event.convention_id);
  }

  const uniqueConventionIds = candidateConventionIds
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .filter((value, index, self) => self.indexOf(value) === index);

  const primaryConventionId = uniqueConventionIds[0] ?? null;
  const conventionInfoPromise = primaryConventionId
    ? fetchConventionInfo(env, primaryConventionId)
    : Promise.resolve(null);

  const fursuitOwnerId = rawOwnerId && rawOwnerId !== catcherId ? rawOwnerId : null;
  const occurredAt = typeof catchRow.caught_at === "string" ? catchRow.caught_at : event.occurred_at;

  console.info("[orchestrator] catch context", {
    event_id: event.event_id,
    catch_id: catchId,
    wasTutorialCatch,
    rawOwnerId,
    catcherId,
  });

  const totalCatchesPromise = countCatchesByUser(env, catcherId);
  const totalFursuitCatchesPromise = fursuitOwnerId
    ? countCatchesByFursuit(env, fursuitId)
    : Promise.resolve(0);

  const conventionInfoMap = new Map<string, ConventionInfo | null>();
  if (primaryConventionId) {
    conventionInfoMap.set(primaryConventionId, await conventionInfoPromise);
  }
  const otherConventionIds = uniqueConventionIds.filter((id) => id !== primaryConventionId);
  if (otherConventionIds.length > 0) {
    const otherInfos = await Promise.all(
      otherConventionIds.map((id) => fetchConventionInfo(env, id)),
    );
    otherConventionIds.forEach((id, index) => {
      conventionInfoMap.set(id, otherInfos[index] ?? null);
    });
  }

  const syncDailyTasks = async () => {
    if (uniqueConventionIds.length === 0) {
      return;
    }
    for (const conventionId of uniqueConventionIds) {
      const info = conventionInfoMap.get(conventionId) ?? null;
      await processDailyTasksForEvent({
        env,
        event,
        userId: catcherId,
        conventionId,
        conventionInfo: info,
        occurredAt,
      });
    }
  };

  await syncDailyTasks();

  if (wasTutorialCatch) {
    console.info("[orchestrator] Skipping tutorial catch achievements", {
      event_id: event.event_id,
      catch_id: catchId,
    });
    return;
  }

  // ========== PHASE 1: QUICK AWARDS (grant immediately) ==========
  const phase1Start = Date.now();
  const quickAwards: {
    userId: string;
    achievementKey: string;
    context: Record<string, unknown>;
    occurredAt: string;
    sourceEventId: string;
  }[] = [];

  // Parallelize independent queries for Phase 1
  const [totalCatches, totalFursuitCatches] = await Promise.all([
    totalCatchesPromise,
    totalFursuitCatchesPromise,
  ]);
  const conventionInfo = primaryConventionId
    ? conventionInfoMap.get(primaryConventionId) ?? null
    : null;
  const phase1CountEnd = Date.now();

  if (totalCatches === 1) {
    quickAwards.push({
      userId: catcherId,
      achievementKey: "FIRST_CATCH",
      context: {
        catch_id: catchId,
        fursuit_id: fursuitId,
      },
      occurredAt,
      sourceEventId: event.event_id,
    });
  }

  if (totalCatches >= 10) {
    quickAwards.push({
      userId: catcherId,
      achievementKey: "GETTING_THE_HANG_OF_IT",
      context: {
        catch_id: catchId,
        fursuit_id: fursuitId,
      },
      occurredAt,
      sourceEventId: event.event_id,
    });
  }

  if (totalCatches >= 25) {
    quickAwards.push({
      userId: catcherId,
      achievementKey: "SUPER_CATCHER",
      context: {
        catch_id: catchId,
        fursuit_id: fursuitId,
      },
      occurredAt,
      sourceEventId: event.event_id,
    });
  }

  // Quick check: DEBUT_PERFORMANCE for fursuit owner (using parallel query result)
  if (fursuitOwnerId && totalFursuitCatches === 1) {
    quickAwards.push({
      userId: fursuitOwnerId,
      achievementKey: "DEBUT_PERFORMANCE",
      context: {
        catch_id: catchId,
        fursuit_id: fursuitId,
        owner_id: fursuitOwnerId,
        catcher_id: catcherId,
      },
      occurredAt,
      sourceEventId: event.event_id,
    });
  }

  // Quick check: Convention-based time achievements (using parallel query result)
  if (primaryConventionId && conventionInfo) {
    const localParts = toLocalParts(occurredAt, conventionInfo.timezone);

    if (conventionInfo.startDate && localParts.date === conventionInfo.startDate) {
      quickAwards.push({
        userId: catcherId,
        achievementKey: "DAY_ONE_DEVOTEE",
        context: {
          catch_id: catchId,
          fursuit_id: fursuitId,
          convention_id: primaryConventionId,
        },
        occurredAt,
        sourceEventId: event.event_id,
      });
    }

    if (localParts.hour >= 22) {
      quickAwards.push({
        userId: catcherId,
        achievementKey: "NIGHT_OWL",
        context: {
          catch_id: catchId,
          fursuit_id: fursuitId,
          convention_id: primaryConventionId,
        },
        occurredAt,
        sourceEventId: event.event_id,
      });
    }
  }

  const phase1End = Date.now();

  // GRANT QUICK AWARDS IMMEDIATELY
  if (quickAwards.length > 0) {
    await grantAchievementsBatch(env, quickAwards);
    console.info("[orchestrator] Phase 1 complete: Granted quick achievements", {
      event_id: event.event_id,
      catch_id: catchId,
      count: quickAwards.length,
      achievements: quickAwards.map((a) => a.achievementKey),
      phase1_count_ms: phase1CountEnd - phase1Start,
      phase1_total_ms: phase1End - phase1Start,
      total_latency_ms: phase1End - startTime,
    });
  } else {
    console.info("[orchestrator] Phase 1 complete: No quick achievements to grant", {
      event_id: event.event_id,
      catch_id: catchId,
      phase1_total_ms: phase1End - phase1Start,
    });
  }

  // ========== PHASE 2: COMPLEX AWARDS (grant after heavy queries) ==========
  const phase2Start = Date.now();
  const complexAwards: {
    userId: string;
    achievementKey: string;
    context: Record<string, unknown>;
    occurredAt: string;
    sourceEventId: string;
  }[] = [];

  // Heavy query: Distinct species count
  const distinctSpeciesStart = Date.now();
  const distinctSpecies = await countDistinctSpeciesCaught(env, catcherId);
  const distinctSpeciesEnd = Date.now();

  if (distinctSpecies >= 5) {
    complexAwards.push({
      userId: catcherId,
      achievementKey: "SUIT_SAMPLER",
      context: {
        catch_id: catchId,
        fursuit_id: fursuitId,
        distinct_species: distinctSpecies,
      },
      occurredAt,
      sourceEventId: event.event_id,
    });
  }

  // Medium query: Check hybrid/multi-species
  const hybridStart = Date.now();
  const isHybrid = await hasHybridOrMultiSpecies(env, fursuitId);
  const hybridEnd = Date.now();

  if (isHybrid) {
    complexAwards.push({
      userId: catcherId,
      achievementKey: "MIX_AND_MATCH",
      context: {
        catch_id: catchId,
        fursuit_id: fursuitId,
      },
      occurredAt,
      sourceEventId: event.event_id,
    });

    if (fursuitOwnerId) {
      complexAwards.push({
        userId: fursuitOwnerId,
        achievementKey: "HYBRID_VIBES",
        context: {
          catch_id: catchId,
          fursuit_id: fursuitId,
          owner_id: fursuitOwnerId,
        },
        occurredAt,
        sourceEventId: event.event_id,
      });
    }
  }

  // Medium query: Check double catch within minute
  const doubleTroubleStart = Date.now();
  const hasDoubleCatch = await hasSecondCatchWithinMinute(env, catcherId, occurredAt);
  const doubleTroubleEnd = Date.now();

  if (hasDoubleCatch) {
    complexAwards.push({
      userId: catcherId,
      achievementKey: "DOUBLE_TROUBLE",
      context: {
        catch_id: catchId,
        fursuit_id: fursuitId,
      },
      occurredAt,
      sourceEventId: event.event_id,
    });
  }

  // Heavy query: Convention-based achievements
  if (primaryConventionId) {
    const conventionEventsStart = Date.now();
    const eventsAtConvention = await countCatchEventsForFursuitAtConvention(
      env,
      fursuitId,
      primaryConventionId,
    );
    const filteredEvents = eventsAtConvention.filter((evt) => {
      const payloadRecord = evt.payload ?? {};
      return payloadRecord?.is_tutorial !== true && payloadRecord?.is_tutorial !== "true";
    });
    const conventionEventsEnd = Date.now();

    if (filteredEvents.length >= 25 && fursuitOwnerId) {
      complexAwards.push({
        userId: fursuitOwnerId,
        achievementKey: "FAN_FAVORITE",
        context: {
          catch_id: catchId,
          fursuit_id: fursuitId,
          owner_id: fursuitOwnerId,
          convention_id: primaryConventionId,
        },
        occurredAt,
        sourceEventId: event.event_id,
      });
    }

    const uniqueCatchers = new Set<string>();
    for (const evt of filteredEvents) {
      if (evt.user_id) uniqueCatchers.add(evt.user_id);
    }

    if (uniqueCatchers.size < 10) {
      complexAwards.push({
        userId: catcherId,
        achievementKey: "RARE_FIND",
        context: {
          catch_id: catchId,
          fursuit_id: fursuitId,
          convention_id: primaryConventionId,
        },
        occurredAt,
        sourceEventId: event.event_id,
      });
    }

    console.info("[orchestrator] Convention events query completed", {
      convention_events_ms: conventionEventsEnd - conventionEventsStart,
    });
  }

  // Heavy query: Distinct conventions count
  const conventionsStart = Date.now();
  const distinctConventions = await countDistinctConventionsForUser(env, catcherId);
  const conventionsEnd = Date.now();

  if (distinctConventions >= 3) {
    complexAwards.push({
      userId: catcherId,
      achievementKey: "WORLD_TOUR",
      context: {
        catch_id: catchId,
        fursuit_id: fursuitId,
        conventions: distinctConventions,
      },
      occurredAt,
      sourceEventId: event.event_id,
    });
  }

  const phase2End = Date.now();

  // GRANT COMPLEX AWARDS
  if (complexAwards.length > 0) {
    await grantAchievementsBatch(env, complexAwards);
    console.info("[orchestrator] Phase 2 complete: Granted complex achievements", {
      event_id: event.event_id,
      catch_id: catchId,
      count: complexAwards.length,
      achievements: complexAwards.map((a) => a.achievementKey),
      distinct_species_ms: distinctSpeciesEnd - distinctSpeciesStart,
      hybrid_check_ms: hybridEnd - hybridStart,
      double_trouble_ms: doubleTroubleEnd - doubleTroubleStart,
      conventions_ms: conventionsEnd - conventionsStart,
      phase2_total_ms: phase2End - phase2Start,
      total_latency_ms: phase2End - startTime,
    });
  } else {
    console.info("[orchestrator] Phase 2 complete: No complex achievements to grant", {
      event_id: event.event_id,
      catch_id: catchId,
      distinct_species_ms: distinctSpeciesEnd - distinctSpeciesStart,
      hybrid_check_ms: hybridEnd - hybridStart,
      double_trouble_ms: doubleTroubleEnd - doubleTroubleStart,
      conventions_ms: conventionsEnd - conventionsStart,
      phase2_total_ms: phase2End - phase2Start,
    });
  }

  const endTime = Date.now();
  console.info("[orchestrator] catch_performed processing complete", {
    event_id: event.event_id,
    catch_id: catchId,
    total_awards: quickAwards.length + complexAwards.length,
    quick_awards: quickAwards.length,
    complex_awards: complexAwards.length,
    phase1_ms: phase1End - phase1Start,
    phase2_ms: phase2End - phase2Start,
    total_ms: endTime - startTime,
  });
}

async function handleProfileUpdated(env: Env, event: EventRecord) {
  const userId = event.user_id;
  if (!userId) {
    console.warn("[orchestrator] profile_updated missing user_id", {
      event_id: event.event_id,
    });
    return;
  }

  try {
    const response = await supabaseFetch(
      env,
      `/rest/v1/profiles?select=username,bio,avatar_url&id=eq.${encodeURIComponent(userId)}`,
    );
    const rows = (await response.json()) as { username: string | null; bio: string | null; avatar_url: string | null }[];
    const profile = rows?.[0];

    if (!profile) {
      console.warn("[orchestrator] profile_updated user profile not found", {
        userId,
      });
      return;
    }

    const hasUsername = Boolean(profile.username && profile.username.trim().length > 0);
    const hasBio = Boolean(profile.bio && profile.bio.trim().length > 0);
    const hasAvatar = Boolean(profile.avatar_url && profile.avatar_url.trim().length > 0);

    if (!hasUsername || !hasBio || !hasAvatar) {
      console.info("[orchestrator] Profile not fully populated; PROFILE_COMPLETE not granted", {
        userId,
        hasUsername,
        hasBio,
        hasAvatar,
      });
      return;
    }

    await grantAchievementsBatch(env, [
      {
        userId,
        achievementKey: "PROFILE_COMPLETE",
        context: {
          user_id: userId,
        },
        occurredAt: event.occurred_at,
        sourceEventId: event.event_id,
      },
    ]);
  } catch (error) {
    console.error("[orchestrator] Failed handling profile_updated", {
      userId,
      error,
    });
  }
}

async function handleOnboardingCompleted(env: Env, event: EventRecord) {
  const userId = event.user_id;
  if (!userId) {
    console.warn("[orchestrator] onboarding_completed missing user_id", {
      event_id: event.event_id,
    });
    return;
  }

  await grantAchievementsBatch(env, [
    {
      userId,
      achievementKey: "getting_started",
      context: {
        user_id: userId,
        source: event.payload?.source ?? null,
      },
      occurredAt: event.occurred_at,
      sourceEventId: event.event_id,
    },
  ]);
}

async function handleConventionJoined(env: Env, event: EventRecord) {
  const userId = event.user_id;
  const conventionId =
    event.convention_id ??
    (typeof event.payload?.convention_id === "string"
      ? (event.payload.convention_id as string)
      : null);

  if (!userId || !conventionId) {
    console.warn("[orchestrator] convention_joined missing data", {
      event_id: event.event_id,
      user_id: userId,
      convention_id: conventionId,
    });
    return;
  }

  await grantAchievementsBatch(env, [
    {
      userId,
      achievementKey: "EXPLORER",
      context: {
        user_id: userId,
        convention_id: conventionId,
      },
      occurredAt: event.occurred_at,
      sourceEventId: event.event_id,
    },
  ]);
}

async function handleDailyProgressEvent(env: Env, event: EventRecord, reason: string) {
  const userId = event.user_id;
  if (!userId) {
    console.warn(`[orchestrator] ${reason} missing user_id`, {
      event_id: event.event_id,
    });
    return;
  }

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  let conventionId = event.convention_id;
  if (!conventionId || conventionId.length === 0) {
    const payloadConventionId = typeof payload.convention_id === "string" ? payload.convention_id : null;
    let arrayConventionId: string | null = null;
    if (Array.isArray(payload.convention_ids)) {
      for (const value of payload.convention_ids) {
        if (typeof value === "string" && value.length > 0) {
          arrayConventionId = value;
          break;
        }
      }
    }
    conventionId = payloadConventionId ?? arrayConventionId ?? null;
  }

  if (!conventionId) {
    console.warn(`[orchestrator] ${reason} missing convention context`, {
      event_id: event.event_id,
      user_id: userId,
    });
    return;
  }

  const conventionInfo = await fetchConventionInfo(env, conventionId);
  await processDailyTasksForEvent({
    env,
    event,
    userId,
    conventionId,
    conventionInfo,
  });

  console.info(`[orchestrator] ${reason} daily tasks processed`, {
    event_id: event.event_id,
    user_id: userId,
    convention_id: conventionId,
  });
}

async function handleLeaderboardRefreshed(env: Env, event: EventRecord) {
  await handleDailyProgressEvent(env, event, "leaderboard_refreshed");
}

async function warmSupabaseConnection(env: Env): Promise<void> {
  try {
    await supabaseFetch(env, "/rest/v1/conventions?select=id&limit=1");
  } catch (error) {
    console.warn("[orchestrator] Scheduled warmup failed", { error: describeError(error) });
  }
}

function isEventRecord(value: unknown): value is EventRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.event_id === "string" &&
    typeof record.type === "string" &&
    typeof record.user_id === "string" &&
    typeof record.occurred_at === "string" &&
    ("convention_id" in record ? record.convention_id === null || typeof record.convention_id === "string" : true) &&
    typeof record.payload === "object" &&
    record.payload !== null
  );
}

function isQueueMessage(value: unknown): value is QueueMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.received_at === "string" && isEventRecord(record.event);
}

function computeRetryDelay(attempts: number): number {
  const exponential = BASE_RETRY_DELAY_SECONDS * 2 ** Math.max(0, attempts - 1);
  return Math.min(exponential, MAX_RETRY_DELAY_SECONDS);
}

async function processEventMessage(message: QueueMessage, env: Env): Promise<void> {
  const startTime = Date.now();
  const { event } = message;
  console.info(
    `[orchestrator] Processing event ${event.event_id} (${event.type}) for user ${event.user_id}`,
    {
      convention_id: event.convention_id,
      received_at: message.received_at,
      payload_keys: Object.keys(event.payload ?? {}),
    },
  );

  switch (event.type) {
    case "catch_performed":
      await handleCatchPerformed(env, event);
      break;
    case "profile_updated":
      await handleProfileUpdated(env, event);
      break;
    case "onboarding_completed":
      await handleOnboardingCompleted(env, event);
      await handleProfileUpdated(env, event);
      break;
    case "leaderboard_refreshed":
      await handleLeaderboardRefreshed(env, event);
      break;
    case "catch_shared":
    case "fursuit_bio_viewed":
      await handleDailyProgressEvent(env, event, event.type);
      break;
    case "convention_joined":
      await handleConventionJoined(env, event);
      break;
    case "daily_reset":
      await handleDailyResetEvent(env, event);
      break;
    default:
      console.info("[orchestrator] No legacy handler for event type", {
        event_id: event.event_id,
        type: event.type,
      });
  }

  const endTime = Date.now();
  console.info(`[orchestrator] Event processing complete`, {
    event_id: event.event_id,
    type: event.type,
    total_processing_ms: endTime - startTime,
  });
}

async function handleMessage(message: Message<unknown>, env: Env): Promise<void> {
  if (!isQueueMessage(message.body)) {
    console.error("[orchestrator] Received malformed message body", {
      message_id: message.id,
      attempts: message.attempts,
      body: message.body,
    });
    message.ack();
    return;
  }

  try {
    await processEventMessage(message.body, env);
    message.ack();
  } catch (error) {
    const attempts = message.attempts;
    const delay = computeRetryDelay(attempts + 1);
    console.error("[orchestrator] Failed processing message", {
      message_id: message.id,
      event_id: message.body.event.event_id,
      attempts,
      delay_seconds: delay,
      error: describeError(error),
    });
    message.retry({ delaySeconds: delay });
  }
}

export default {
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    for (const message of batch.messages) {
      ctx.waitUntil(handleMessage(message, env));
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(warmSupabaseConnection(env));
  },
};
