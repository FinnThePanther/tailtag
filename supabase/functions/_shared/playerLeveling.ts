// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions run in Deno.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import type { DailyTaskCompletion, DailyTaskProcessResult } from './dailyTasks.ts';
import type { InsertableEventRow, Json } from './types.ts';

export const PLAYER_XP_AMOUNTS = {
  acceptedCatch: 100,
  firstAcceptedCatch: 100,
  dailyTaskCompleted: 50,
  dailyAllComplete: 150,
  logicalAchievement: 100,
  ownedFursuitCaught: 25,
} as const;

export const OWNED_FURSUIT_DAILY_XP_CAP = 5;
export const DAILY_TASK_ACHIEVEMENT_PREFIX = 'DAILY_TASK_';

export type PlayerXpAwardResult = {
  xp_event_id: string;
  awarded: boolean;
  user_id: string;
  xp_amount: number;
  xp_before: number;
  xp_after: number;
  level_before: number;
  level_after: number;
  leveled_up: boolean;
  levels_gained: number;
};

type AwardPlayerXpParams = {
  userId: string;
  xpAmount: number;
  reason: string;
  dedupeKey: string;
  sourceEventId?: string | null;
  metadata?: Json;
};

export type AchievementXpAwardSummary = {
  achievement_key: string;
  achievement_id?: string | null;
  user_id: string;
  awarded: boolean;
  context?: Record<string, unknown> | null;
  awarded_at?: string | null;
  source_event_id?: string | null;
};

type AcceptedCatchXpParams = {
  event: InsertableEventRow;
  catcherId: string;
  catchId: string;
  fursuitId: string;
  conventionId?: string | null;
  isFirstAcceptedCatch: boolean;
};

type OwnedFursuitCatchXpParams = {
  event: InsertableEventRow;
  ownerId: string;
  catchId: string;
  fursuitId: string;
  conventionId?: string | null;
  localDay: string;
};

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeLogicalAchievementKey(value: unknown): string | null {
  const raw = normalizeNonEmptyString(value);
  if (!raw) {
    return null;
  }

  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized.length > 0 ? normalized : null;
}

function readSourceAchievementKey(context: Record<string, unknown> | null | undefined) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return null;
  }
  return normalizeLogicalAchievementKey(context['source_achievement_key']);
}

export function getLogicalAchievementKey(summary: AchievementXpAwardSummary): string | null {
  return (
    readSourceAchievementKey(summary.context) ??
    normalizeLogicalAchievementKey(summary.achievement_key)
  );
}

export function isDailyTaskAchievementKey(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(DAILY_TASK_ACHIEVEMENT_PREFIX);
}

function compactMetadata(metadata: Record<string, unknown>): Json {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  ) as Json;
}

async function awardPlayerXpOnce(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  params: AwardPlayerXpParams,
): Promise<PlayerXpAwardResult[]> {
  const { data, error } = await supabaseAdmin.rpc('award_player_xp_once', {
    p_user_id: params.userId,
    p_xp_amount: params.xpAmount,
    p_reason: params.reason,
    p_dedupe_key: params.dedupeKey,
    p_source_event_id: params.sourceEventId ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    throw new Error(`Failed awarding player XP (${params.reason}): ${error.message}`);
  }

  return (data ?? []) as PlayerXpAwardResult[];
}

export async function awardAcceptedCatchXp(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  params: AcceptedCatchXpParams,
): Promise<PlayerXpAwardResult[]> {
  const metadata = compactMetadata({
    catch_id: params.catchId,
    fursuit_id: params.fursuitId,
    convention_id: params.conventionId ?? null,
    event_id: params.event.event_id,
  });

  const results: PlayerXpAwardResult[] = [];
  results.push(
    ...(await awardPlayerXpOnce(supabaseAdmin, {
      userId: params.catcherId,
      xpAmount: PLAYER_XP_AMOUNTS.acceptedCatch,
      reason: 'accepted_catch',
      dedupeKey: `accepted-catch:${params.catchId}`,
      sourceEventId: params.event.event_id,
      metadata,
    })),
  );

  if (params.isFirstAcceptedCatch) {
    results.push(
      ...(await awardPlayerXpOnce(supabaseAdmin, {
        userId: params.catcherId,
        xpAmount: PLAYER_XP_AMOUNTS.firstAcceptedCatch,
        reason: 'first_accepted_catch',
        dedupeKey: 'first-accepted-catch',
        sourceEventId: params.event.event_id,
        metadata,
      })),
    );
  }

  return results;
}

export async function awardOwnedFursuitCatchXp(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  params: OwnedFursuitCatchXpParams,
): Promise<PlayerXpAwardResult[]> {
  const metadata = compactMetadata({
    catch_id: params.catchId,
    fursuit_id: params.fursuitId,
    convention_id: params.conventionId ?? null,
    local_day: params.localDay,
    event_id: params.event.event_id,
    daily_cap: OWNED_FURSUIT_DAILY_XP_CAP,
  });

  const { data, error } = await supabaseAdmin.rpc('award_owned_fursuit_catch_xp_once', {
    p_owner_id: params.ownerId,
    p_xp_amount: PLAYER_XP_AMOUNTS.ownedFursuitCaught,
    p_catch_id: params.catchId,
    p_fursuit_id: params.fursuitId,
    p_convention_id: params.conventionId ?? null,
    p_local_day: params.localDay,
    p_source_event_id: params.event.event_id,
    p_metadata: metadata,
    p_daily_cap: OWNED_FURSUIT_DAILY_XP_CAP,
  });

  if (error) {
    throw new Error(`Failed awarding owned-fursuit catch XP: ${error.message}`);
  }

  return (data ?? []) as PlayerXpAwardResult[];
}

function dailyTaskCompletionMetadata(
  completion: DailyTaskCompletion,
  event: InsertableEventRow,
): Json {
  return compactMetadata({
    event_id: event.event_id,
    convention_id: completion.conventionId,
    day: completion.day,
    task_id: completion.taskId,
    task_name: completion.taskName,
    requirement: completion.requirement,
  });
}

export async function awardDailyTaskXp(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  result: DailyTaskProcessResult,
  event: InsertableEventRow,
): Promise<PlayerXpAwardResult[]> {
  const xpResults: PlayerXpAwardResult[] = [];

  for (const completion of result.completions) {
    xpResults.push(
      ...(await awardPlayerXpOnce(supabaseAdmin, {
        userId: completion.userId,
        xpAmount: PLAYER_XP_AMOUNTS.dailyTaskCompleted,
        reason: 'daily_task_completed',
        dedupeKey: `daily-task-completed:${completion.conventionId}:${completion.day}:${completion.taskId}`,
        sourceEventId: event.event_id,
        metadata: dailyTaskCompletionMetadata(completion, event),
      })),
    );
  }

  if (result.allTasksCompleted && result.allTasksCompletionDay) {
    const completion = result.completions[0];
    if (completion) {
      xpResults.push(
        ...(await awardPlayerXpOnce(supabaseAdmin, {
          userId: completion.userId,
          xpAmount: PLAYER_XP_AMOUNTS.dailyAllComplete,
          reason: 'daily_all_complete',
          dedupeKey: `daily-all-complete:${completion.conventionId}:${result.allTasksCompletionDay}`,
          sourceEventId: event.event_id,
          metadata: compactMetadata({
            event_id: event.event_id,
            convention_id: completion.conventionId,
            day: result.allTasksCompletionDay,
            current_streak: result.streak?.current,
            best_streak: result.streak?.best,
          }),
        })),
      );
    }
  }

  return xpResults;
}

export async function awardAchievementXp(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  summaries: AchievementXpAwardSummary[],
  event: InsertableEventRow,
): Promise<PlayerXpAwardResult[]> {
  const seen = new Set<string>();
  const results: PlayerXpAwardResult[] = [];

  for (const summary of summaries) {
    if (!summary.awarded || isDailyTaskAchievementKey(summary.achievement_key)) {
      continue;
    }

    const logicalKey = getLogicalAchievementKey(summary);
    if (!logicalKey) {
      continue;
    }

    const seenKey = `${summary.user_id}:${logicalKey}`;
    if (seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);

    results.push(
      ...(await awardPlayerXpOnce(supabaseAdmin, {
        userId: summary.user_id,
        xpAmount: PLAYER_XP_AMOUNTS.logicalAchievement,
        reason: 'logical_achievement_unlocked',
        dedupeKey: `achievement-unlocked:${logicalKey}`,
        sourceEventId: summary.source_event_id ?? event.event_id,
        metadata: compactMetadata({
          event_id: event.event_id,
          achievement_id: summary.achievement_id ?? null,
          achievement_key: summary.achievement_key,
          logical_achievement_key: logicalKey,
          awarded_at: summary.awarded_at ?? null,
          context: summary.context ?? {},
        }),
      })),
    );
  }

  return results;
}

export async function insertLevelUpNotificationsForXpAwards(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  results: PlayerXpAwardResult[],
  event: InsertableEventRow,
): Promise<void> {
  const bestByUser = new Map<string, PlayerXpAwardResult>();
  const levelBeforeByUser = new Map<string, number>();

  for (const result of results) {
    if (!result.awarded || !result.leveled_up) {
      continue;
    }

    const existingBest = bestByUser.get(result.user_id);
    if (
      !existingBest ||
      result.level_after > existingBest.level_after ||
      (result.level_after === existingBest.level_after && result.xp_after > existingBest.xp_after)
    ) {
      bestByUser.set(result.user_id, result);
    }

    const existingBefore = levelBeforeByUser.get(result.user_id);
    if (existingBefore === undefined || result.level_before < existingBefore) {
      levelBeforeByUser.set(result.user_id, result.level_before);
    }
  }

  await Promise.all(
    Array.from(bestByUser.values()).map(async (result) => {
      const levelBefore = levelBeforeByUser.get(result.user_id) ?? result.level_before;
      const { error } = await supabaseAdmin.rpc('insert_notification_once', {
        p_user_id: result.user_id,
        p_type: 'level_up',
        p_payload: {
          level_before: levelBefore,
          level_after: result.level_after,
          levels_gained: Math.max(result.level_after - levelBefore, 0),
          xp_after: result.xp_after,
          source_event_id: event.event_id,
          xp_event_id: result.xp_event_id,
        },
        p_dedupe_key: `level-up:${result.level_after}`,
      });

      if (error) {
        console.error('[playerLeveling] Failed inserting level-up notification', {
          user_id: result.user_id,
          event_id: event.event_id,
          level_after: result.level_after,
          error,
        });
      }
    }),
  );
}
