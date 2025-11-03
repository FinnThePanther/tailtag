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

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type EventRecord = {
  event_id: string;
  user_id: string;
  type: string;
  convention_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
};

type QueueMessage = {
  event: EventRecord;
  received_at: string;
};

type AchievementAwardSummary = {
  key: string;
  userId: string;
  awarded: boolean;
  context?: Record<string, unknown> | null;
};

const MAX_RETRY_DELAY_SECONDS = 300;
const BASE_RETRY_DELAY_SECONDS = 5;
const ACHIEVEMENT_CACHE_TTL_MS = 5 * 60 * 1000;

let achievementCache: Map<string, { id: string; key: string; rule_id: string | null }> | null = null;
let achievementCacheExpiresAt = 0;

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

function buildSupabaseHeaders(env: Env, initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders ?? {});
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Authorization", `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  return headers;
}

async function supabaseFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${env.SUPABASE_URL}${path}`;
  const headers = buildSupabaseHeaders(env, init.headers);
  const method = init.method ? init.method.toUpperCase() : "GET";

  if (method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(
      `Supabase request failed (${response.status} ${response.statusText}) for ${path}: ${errorText}`,
    );
  }

  return response;
}

async function fetchCatchWithRelations(env: Env, catchId: string) {
  const params = new URLSearchParams({
    select:
      "id,catcher_id,fursuit_id,is_tutorial,caught_at,fursuit:fursuits(id,owner_id)",
    id: `eq.${catchId}`,
    limit: "1",
  });

  const response = await supabaseFetch(env, `/rest/v1/catches?${params.toString()}`);
  const data = (await response.json()) as Array<Record<string, unknown>>;
  return data?.[0] ?? null;
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
  const rows = (await response.json()) as Array<{ id: string; key: string; rule_id: string | null }>;

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

async function countRows(env: Env, path: string): Promise<number> {
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

async function grantAchievement(
  env: Env,
  options: {
    userId: string;
    achievementKey: string;
    context: Record<string, unknown>;
    occurredAt: string;
    sourceEventId: string;
  },
): Promise<AchievementAwardSummary | null> {
  const catalog = await ensureAchievementCache(env);
  const achievement = catalog.get(options.achievementKey);

  if (!achievement) {
    console.warn("[orchestrator] Unknown achievement key", {
      key: options.achievementKey,
      user_id: options.userId,
    });
    return null;
  }

  try {
    const existingResponse = await supabaseFetch(
      env,
      `/rest/v1/user_achievements?select=id&user_id=eq.${options.userId}&achievement_id=eq.${achievement.id}`,
      {
        headers: {
          Range: "0-0",
        },
      },
    );
    const existing = await existingResponse.json() as Array<{ id: string }>;
    if (existing.length > 0) {
      console.info("[orchestrator] Achievement already unlocked", {
        key: options.achievementKey,
        user_id: options.userId,
      });
      return null;
    }
  } catch (error) {
    console.error("[orchestrator] Failed checking existing achievement", {
      key: options.achievementKey,
      user_id: options.userId,
      error,
    });
    return null;
  }

  const payload = {
    user_id: options.userId,
    achievement_id: achievement.id,
    unlocked_at: options.occurredAt,
    context: options.context,
  };

  try {
    await supabaseFetch(
      env,
      "/rest/v1/user_achievements?on_conflict=user_id,achievement_id",
      {
        method: "POST",
        headers: {
          Prefer: "return=minimal,resolution=merge-duplicates",
        },
        body: JSON.stringify([payload]),
      },
    );
  } catch (error) {
    console.error("[orchestrator] Failed inserting user_achievements row", {
      key: options.achievementKey,
      user_id: options.userId,
      error,
    });
    return null;
  }

  if (achievement.rule_id) {
    try {
      await supabaseFetch(
        env,
        "/rest/v1/user_awards?on_conflict=user_id,rule_id,window_key",
        {
          method: "POST",
          headers: {
            Prefer: "return=minimal,resolution=merge-duplicates",
          },
          body: JSON.stringify([
            {
              user_id: options.userId,
              rule_id: achievement.rule_id,
              window_key: "global",
              awarded_at: options.occurredAt,
              awarded_for_event: options.sourceEventId,
              details: options.context,
            },
          ]),
        },
      );
    } catch (error) {
      console.error("[orchestrator] Failed upserting user_awards row", {
        key: options.achievementKey,
        user_id: options.userId,
        error,
      });
    }

    try {
      await supabaseFetch(env, "/rest/v1/awards_log", {
        method: "POST",
        headers: {
          Prefer: "return=minimal",
        },
        body: JSON.stringify([
          {
            user_id: options.userId,
            rule_id: achievement.rule_id,
            window_key: "global",
            event_id: options.sourceEventId,
            action: "grant",
            created_at: options.occurredAt,
          },
        ]),
      });
    } catch (error) {
      console.error("[orchestrator] Failed inserting awards_log entry", {
        key: options.achievementKey,
        user_id: options.userId,
        error,
      });
    }
  }

  console.info("[orchestrator] Granted achievement", {
    key: options.achievementKey,
    user_id: options.userId,
  });

  return {
    key: achievement.key,
    userId: options.userId,
    awarded: true,
    context: options.context,
  } satisfies AchievementAwardSummary;
}


async function emitNotificationsForAwards(
  env: Env,
  awards: AchievementAwardSummary[],
  meta: { sourceEventId: string; occurredAt: string },
) {
  if (!awards || awards.length === 0) {
    return;
  }

  const catalog = await ensureAchievementCache(env);
  const notifications: Array<Record<string, unknown>> = [];

  for (const award of awards) {
    if (!award.awarded) {
      continue;
    }

    const achievement = catalog.get(award.key);
    if (!achievement) {
      console.warn("[orchestrator] Unknown achievement key from processor", {
        key: award.key,
      });
      continue;
    }

    const payload: Record<string, unknown> = {
      achievement_id: achievement.id,
      achievement_key: achievement.key,
      context: award.context ?? {},
      awarded_at: meta.occurredAt,
      source_event_id: meta.sourceEventId,
    };

    notifications.push({
      user_id: award.userId,
      type: "achievement_awarded",
      payload,
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
    console.info("[orchestrator] Inserted notifications", {
      count: notifications.length,
      source_event_id: meta.sourceEventId,
    });
  } catch (error) {
    console.error("[orchestrator] Failed inserting notifications", {
      error,
      count: notifications.length,
    });
  }
}

async function handleCatchPerformed(env: Env, event: EventRecord) {
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
    fursuit_owner_id: (catchRow.fursuit as { owner_id?: string | null } | null)?.owner_id ?? null,
  });

  const catcherId = typeof catchRow.catcher_id === "string" ? catchRow.catcher_id : event.user_id;
  const fursuitId = typeof catchRow.fursuit_id === "string" ? catchRow.fursuit_id : null;

  if (!catcherId || !fursuitId) {
    console.warn("[orchestrator] Catch row incomplete for catch_performed", {
      event_id: event.event_id,
      catch_id: catchId,
    });
    return;
  }

  const rawOwnerId = (catchRow.fursuit as { owner_id?: string | null } | null)?.owner_id ?? null;
  const wasTutorialCatch =
    typeof (catchRow as { is_tutorial?: boolean | null }).is_tutorial === "boolean"
      ? Boolean((catchRow as { is_tutorial?: boolean | null }).is_tutorial)
      : payload.is_tutorial === true;

  console.info("[orchestrator] catch context", {
    event_id: event.event_id,
    catch_id: catchId,
    wasTutorialCatch,
    rawOwnerId,
    catcherId,
  });

  if (wasTutorialCatch) {
    console.info("[orchestrator] Skipping tutorial catch achievements", {
      event_id: event.event_id,
      catch_id: catchId,
    });
    return;
  }

  const fursuitOwnerId = rawOwnerId && rawOwnerId !== catcherId ? rawOwnerId : null;
  const occurredAt = typeof catchRow.caught_at === "string" ? catchRow.caught_at : event.occurred_at;
  const awards: AchievementAwardSummary[] = [];

  try {
    const totalCatches = await countRows(
      env,
      `/rest/v1/catches?select=id&catcher_id=eq.${encodeURIComponent(catcherId)}&is_tutorial=is.false`,
    );

    if (totalCatches === 1) {
      const award = await grantAchievement(env, {
        userId: catcherId,
        achievementKey: "FIRST_CATCH",
        context: {
          catch_id: catchId,
          fursuit_id: fursuitId,
        },
        occurredAt,
        sourceEventId: event.event_id,
      });

      if (award) {
        awards.push(award);
      }
    } else {
      console.info("[orchestrator] Catcher not eligible for FIRST_CATCH", {
        catcherId,
        totalCatches,
      });
    }
  } catch (error) {
    console.error("[orchestrator] Failed counting catches for catcher", {
      catcherId,
      error,
    });
  }

  if (fursuitOwnerId) {
    if (fursuitOwnerId === catcherId) {
      console.info("[orchestrator] Catcher owns fursuit; owner award suppressed", {
        catch_id: catchId,
        user_id: catcherId,
      });
    } else {
      try {
        const totalFursuitCatches = await countRows(
          env,
          `/rest/v1/catches?select=id&fursuit_id=eq.${encodeURIComponent(fursuitId)}&is_tutorial=is.false&catcher_id=neq.${encodeURIComponent(fursuitOwnerId)}`,
        );

        if (totalFursuitCatches === 1) {
          const award = await grantAchievement(env, {
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

          if (award) {
            awards.push(award);
          }
        } else {
          console.info("[orchestrator] Fursuit not eligible for DEBUT_PERFORMANCE", {
            fursuitId,
            ownerId: fursuitOwnerId,
            totalFursuitCatches,
          });
        }
      } catch (error) {
        console.error("[orchestrator] Failed counting catches for fursuit", {
          fursuitId,
          ownerId: fursuitOwnerId,
          error,
        });
      }
    }
  }

  if (awards.length > 0) {
    await emitNotificationsForAwards(env, awards, {
      sourceEventId: event.event_id,
      occurredAt,
    });
  } else {
    console.info("[orchestrator] No catch achievements awarded", {
      event_id: event.event_id,
      catch_id: catchId,
    });
  }
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
    const rows = (await response.json()) as Array<{ username: string | null; bio: string | null; avatar_url: string | null }>;
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

    const award = await grantAchievement(env, {
      userId,
      achievementKey: "PROFILE_COMPLETE",
      context: {
        user_id: userId,
      },
      occurredAt: event.occurred_at,
      sourceEventId: event.event_id,
    });

    if (award) {
      await emitNotificationsForAwards(env, [award], {
        sourceEventId: event.event_id,
        occurredAt: event.occurred_at,
      });
    }
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

  const award = await grantAchievement(env, {
    userId,
    achievementKey: "getting_started",
    context: {
      user_id: userId,
      source: event.payload?.source ?? null,
    },
    occurredAt: event.occurred_at,
    sourceEventId: event.event_id,
  });

  if (award) {
    await emitNotificationsForAwards(env, [award], {
      sourceEventId: event.event_id,
      occurredAt: event.occurred_at,
    });
  }
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

  const award = await grantAchievement(env, {
    userId,
    achievementKey: "EXPLORER",
    context: {
      user_id: userId,
      convention_id: conventionId,
    },
    occurredAt: event.occurred_at,
    sourceEventId: event.event_id,
  });

  if (award) {
    await emitNotificationsForAwards(env, [award], {
      sourceEventId: event.event_id,
      occurredAt: event.occurred_at,
    });
  }
}

async function handleLeaderboardRefreshed(_env: Env, event: EventRecord) {
  console.info("[orchestrator] leaderboard_refreshed event received (no achievements)", {
    event_id: event.event_id,
  });
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
    case "convention_joined":
      await handleConventionJoined(env, event);
      break;
    default:
      console.info("[orchestrator] No legacy handler for event type", {
        event_id: event.event_id,
        type: event.type,
      });
  }
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
};
