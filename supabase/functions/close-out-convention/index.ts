/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { drainGameplayQueueOnce } from '../_shared/gameplayQueue.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAGE_SIZE = 1000;
const UPSERT_CHUNK_SIZE = 500;
const QUEUE_DRAIN_MAX_ATTEMPTS = 20;
const QUEUE_DRAIN_MAX_MESSAGES = 500;
const QUEUE_DRAIN_MAX_DURATION_MS = 5000;

const closeoutSteps = [
  'pending_expired',
  'gameplay_queue_drained',
  'recaps_generated',
  'notifications_created',
  'archived',
] as const;

type CloseoutStep = (typeof closeoutSteps)[number];

const rawSupabaseUrl = Deno.env.get('SUPABASE_URL');
const rawServiceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const automationActorId =
  Deno.env.get('LIFECYCLE_AUTOMATION_ACTOR_ID') ?? Deno.env.get('SYSTEM_EVENT_USER_ID') ?? '';

if (!rawSupabaseUrl || !rawServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY environment variables');
}

const supabaseUrl: string = rawSupabaseUrl;
const serviceRoleKey: string = rawServiceRoleKey;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type CloseoutSource =
  | 'admin_close'
  | 'admin_retry'
  | 'admin_regenerate'
  | 'cron_close'
  | 'cron_retry';

type CloseoutRequest = {
  convention_id?: string;
  actor_id?: string;
  source?: CloseoutSource;
  force_regenerate?: boolean;
};

type ConventionRow = {
  id: string;
  name: string | null;
  started_at: string | null;
  geofence_enabled: boolean | null;
  location_verification_required: boolean | null;
  status: string;
  closed_at: string | null;
  archived_at: string | null;
  finalizing_started_at: string | null;
  closeout_not_before: string | null;
  closeout_started_at: string | null;
  closeout_completed_at: string | null;
  closeout_last_attempt_at: string | null;
  closeout_step: string | null;
  closeout_retry_count: number | null;
  closeout_summary: Record<string, unknown> | null;
};

type ProfileConventionRow = {
  profile_id: string;
  created_at: string | null;
  left_at: string | null;
  active_until: string | null;
  attendance_state: string | null;
  verification_method: string | null;
  verified_at: string | null;
  override_at: string | null;
};

type ExistingRecapRow = {
  profile_id: string;
  joined_at: string | null;
};

type ExistingRecapCleanupRow = {
  id: string;
  profile_id: string;
};

type AcceptedCatchRow = {
  catcher_id: string;
  fursuit_id: string;
  caught_at: string | null;
  fursuit:
    | {
        id: string;
        name: string | null;
        owner_id: string | null;
      }
    | {
        id: string;
        name: string | null;
        owner_id: string | null;
      }[]
    | null;
};

type DailyProgressRow = {
  user_id: string;
  day: string;
};

type AchievementUnlockRow = {
  user_id: string;
  achievement_id: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
};

type RecapInsert = {
  convention_id: string;
  profile_id: string;
  joined_at: string | null;
  left_at: string;
  final_rank: number | null;
  catch_count: number;
  fursuits_caught_count: number;
  unique_fursuits_caught_count: number;
  own_fursuits_caught_count: number;
  unique_catchers_for_own_fursuits_count: number;
  daily_tasks_completed_count: number;
  achievements_unlocked_count: number;
  summary: Record<string, unknown>;
  generated_at: string;
};

type RecapNotificationRow = {
  id: string;
  profile_id: string;
  catch_count: number | null;
  unique_fursuits_caught_count: number | null;
  own_fursuits_caught_count: number | null;
  achievements_unlocked_count: number | null;
};

type ExpireResult = {
  success?: boolean;
  expired_count?: number;
  stale_pending_upload_count?: number;
  timestamp?: string;
};

type CloseoutSummary = {
  convention_id: string;
  source: CloseoutSource;
  closed_at: string;
  archived_at: string | null;
  participants_count: number;
  recaps_generated: number;
  pending_catches_expired: number;
  stale_pending_upload_catches_expired: number;
  recap_notifications_created: number;
  profile_memberships_finalized: number;
  fursuit_assignments_finalized: number;
  historical_profile_memberships_stamped: number;
  historical_fursuit_assignments_stamped: number;
  accepted_catches_count: number;
  unique_catchers_count: number;
  unique_fursuits_caught_count: number;
  steps_completed: CloseoutStep[];
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function assertServiceRole(req: Request) {
  if (extractBearerToken(req) !== serviceRoleKey) {
    throw new HttpError('Service role authorization is required.', 401);
  }
}

function normalizeSource(source: unknown): CloseoutSource {
  if (source === 'cron_retry') return 'cron_retry';
  if (source === 'cron_close') return 'cron_close';
  if (source === 'admin_regenerate') return 'admin_regenerate';
  return source === 'admin_retry' ? 'admin_retry' : 'admin_close';
}

function isAutomationSource(source: CloseoutSource) {
  return source === 'cron_close' || source === 'cron_retry';
}

function isRetrySource(source: CloseoutSource) {
  return source === 'cron_retry' || source === 'admin_retry';
}

function isCloseoutStep(value: string | null): value is CloseoutStep {
  return closeoutSteps.includes(value as CloseoutStep);
}

function getNextStepIndex(previousStatus: string, previousStep: string | null) {
  if (!isCloseoutStep(previousStep)) {
    return 0;
  }

  const currentIndex = closeoutSteps.indexOf(previousStep);
  return previousStatus === 'closeout_failed' ? currentIndex : currentIndex + 1;
}

function toSummary(value: Record<string, unknown> | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function writeAudit(
  actorId: string,
  conventionId: string,
  action: string,
  context: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin.from('audit_log').insert({
    actor_id: actorId,
    action,
    entity_type: 'convention',
    entity_id: conventionId,
    context,
  });

  if (error) {
    console.error('[close-out-convention] Failed to write audit row', {
      convention_id: conventionId,
      action,
      error,
    });
  }
}

async function fetchAll<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await loadPage(from, to);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeFursuit(row: AcceptedCatchRow) {
  return Array.isArray(row.fursuit) ? row.fursuit[0] : row.fursuit;
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string) {
  const existing = map.get(key);
  if (existing) {
    existing.add(value);
    return;
  }

  map.set(key, new Set([value]));
}

function hasRecapEligibleAttendanceState(state: string | null) {
  return state === 'active' || state === 'left' || state === 'finalized';
}

function isRecapEligibleMembership(membership: ProfileConventionRow, convention: ConventionRow) {
  if (!hasRecapEligibleAttendanceState(membership.attendance_state)) {
    return false;
  }

  if (!convention.location_verification_required) {
    return true;
  }

  if (membership.verification_method === 'grandfathered') {
    return true;
  }

  if (membership.verification_method === 'manual_override') {
    return Boolean(membership.override_at);
  }

  if (membership.verification_method !== 'gps' || !membership.verified_at) {
    return false;
  }

  return !convention.started_at || membership.verified_at >= convention.started_at;
}

async function loadProfiles(profileIds: string[]) {
  const profiles = new Map<string, ProfileRow>();
  const uniqueIds = [...new Set(profileIds)];

  for (const ids of chunk(uniqueIds, 500)) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username')
      .in('id', ids);

    if (error) throw error;

    for (const row of (data ?? []) as ProfileRow[]) {
      profiles.set(row.id, row);
    }
  }

  return profiles;
}

async function loadConvention(conventionId: string) {
  const { data, error } = await supabaseAdmin
    .from('conventions')
    .select(
      [
        'id',
        'name',
        'started_at',
        'geofence_enabled',
        'location_verification_required',
        'status',
        'closed_at',
        'archived_at',
        'finalizing_started_at',
        'closeout_not_before',
        'closeout_started_at',
        'closeout_completed_at',
        'closeout_last_attempt_at',
        'closeout_step',
        'closeout_retry_count',
        'closeout_summary',
      ].join(', '),
    )
    .eq('id', conventionId)
    .single();

  if (error) throw error;
  if (!data) throw new HttpError('Convention not found.', 404);

  return data as unknown as ConventionRow;
}

async function updateCloseoutSummary(conventionId: string, patch: Record<string, unknown>) {
  const current = await loadConvention(conventionId);
  const summary = {
    ...toSummary(current.closeout_summary),
    ...patch,
  };

  const { error } = await supabaseAdmin
    .from('conventions')
    .update({ closeout_summary: summary })
    .eq('id', conventionId);

  if (error) throw error;
  return summary;
}

async function markStepRunning(conventionId: string, step: CloseoutStep) {
  const { error } = await supabaseAdmin
    .from('conventions')
    .update({
      closeout_step: step,
      closeout_last_attempt_at: new Date().toISOString(),
      closeout_error: null,
    })
    .eq('id', conventionId)
    .eq('status', 'closeout_running');

  if (error) throw error;
}

async function markStepComplete(conventionId: string, step: CloseoutStep) {
  const { error } = await supabaseAdmin
    .from('conventions')
    .update({
      closeout_step: step,
      closeout_retry_count: 0,
      closeout_last_attempt_at: new Date().toISOString(),
      closeout_error: null,
    })
    .eq('id', conventionId)
    .eq('status', 'closeout_running');

  if (error) throw error;
}

async function markStepFailed(
  conventionId: string,
  step: CloseoutStep,
  retryCount: number,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : 'Closeout failed.';
  const { error: updateError } = await supabaseAdmin
    .from('conventions')
    .update({
      status: 'closeout_failed',
      closeout_step: step,
      closeout_last_attempt_at: new Date().toISOString(),
      closeout_retry_count: retryCount + 1,
      closeout_error: message,
    })
    .eq('id', conventionId);

  if (updateError) {
    console.error('[close-out-convention] Failed to mark closeout failure', {
      convention_id: conventionId,
      step,
      updateError,
    });
  }
}

async function expirePendingCatches(conventionId: string) {
  const { data, error } = await supabaseAdmin.rpc(
    'expire_pending_catches_for_convention_closeout',
    {
      p_convention_id: conventionId,
    },
  );

  if (error) throw error;

  const result = (data ?? {}) as ExpireResult;
  return {
    expiredCount: Number(result.expired_count ?? 0),
    stalePendingUploadCount: Number(result.stale_pending_upload_count ?? 0),
  };
}

async function hasVisibleGameplayQueueMessages() {
  const { data, error } = await supabaseAdmin.rpc('has_visible_gameplay_event_queue_messages');
  if (error) throw error;
  return data === true;
}

async function drainGameplayQueue() {
  let totalAttempts = 0;

  while (totalAttempts < QUEUE_DRAIN_MAX_ATTEMPTS) {
    const hasBacklog = await hasVisibleGameplayQueueMessages();
    if (!hasBacklog) {
      return { attempts: totalAttempts, drained: true };
    }

    totalAttempts += 1;
    await drainGameplayQueueOnce({
      supabaseUrl,
      serviceRoleKey,
      maxMessages: QUEUE_DRAIN_MAX_MESSAGES,
      maxDurationMs: QUEUE_DRAIN_MAX_DURATION_MS,
    });
  }

  if (await hasVisibleGameplayQueueMessages()) {
    throw new Error('Gameplay queue still has visible messages after closeout drain attempts.');
  }

  return { attempts: totalAttempts, drained: true };
}

async function buildRecaps(convention: ConventionRow, closedAt: string) {
  const conventionId = convention.id;
  const [memberships, existingRecaps, acceptedCatches, dailyProgress, achievementUnlocks] =
    await Promise.all([
      fetchAll<ProfileConventionRow>(async (from, to) => {
        const { data, error } = await supabaseAdmin
          .from('profile_conventions')
          .select(
            [
              'profile_id',
              'created_at',
              'left_at',
              'active_until',
              'attendance_state',
              'verification_method',
              'verified_at',
              'override_at',
            ].join(', '),
          )
          .eq('convention_id', conventionId)
          .range(from, to);

        return { data: data as unknown as ProfileConventionRow[] | null, error };
      }),
      fetchAll<ExistingRecapRow>((from, to) =>
        supabaseAdmin
          .from('convention_participant_recaps')
          .select('profile_id, joined_at')
          .eq('convention_id', conventionId)
          .range(from, to),
      ),
      fetchAll<AcceptedCatchRow>((from, to) =>
        supabaseAdmin
          .from('catches')
          .select('catcher_id, fursuit_id, caught_at, fursuit:fursuits(id, name, owner_id)')
          .eq('convention_id', conventionId)
          .eq('status', 'ACCEPTED')
          .range(from, to),
      ),
      fetchAll<DailyProgressRow>((from, to) =>
        supabaseAdmin
          .from('user_daily_progress')
          .select('user_id, day')
          .eq('convention_id', conventionId)
          .eq('is_completed', true)
          .range(from, to),
      ),
      fetchAll<AchievementUnlockRow>((from, to) =>
        supabaseAdmin
          .from('user_achievements')
          .select('user_id, achievement_id, achievement:achievements!inner(convention_id)')
          .eq('achievement.convention_id', conventionId)
          .range(from, to),
      ),
    ]);

  const participants = new Set<string>();
  const eligibleParticipants = new Set<string>();
  const joinedAtByProfile = new Map<string, string | null>();
  const catchCountByProfile = new Map<string, number>();
  const caughtFursuitsByProfile = new Map<
    string,
    Map<string, { name: string | null; count: number }>
  >();
  const uniqueCaughtFursuitsByProfile = new Map<string, Set<string>>();
  const ownFursuitCatchesByProfile = new Map<string, number>();
  const ownFursuitsByProfile = new Map<
    string,
    Map<string, { name: string | null; timesCaught: number; uniqueCatchers: Set<string> }>
  >();
  const uniqueCatchersForOwnFursuitsByProfile = new Map<string, Set<string>>();
  const dailyCompletionsByProfile = new Map<string, number>();
  const dailyDaysByProfile = new Map<string, Set<string>>();
  const achievementIdsByProfile = new Map<string, Set<string>>();

  for (const row of existingRecaps) {
    if (row.joined_at) joinedAtByProfile.set(row.profile_id, row.joined_at);
  }

  for (const row of memberships) {
    if (!isRecapEligibleMembership(row, convention)) {
      continue;
    }

    participants.add(row.profile_id);
    eligibleParticipants.add(row.profile_id);
    joinedAtByProfile.set(
      row.profile_id,
      row.created_at ?? joinedAtByProfile.get(row.profile_id) ?? null,
    );
  }

  for (const row of acceptedCatches) {
    const catcherId = row.catcher_id;
    const fursuit = normalizeFursuit(row);
    if (eligibleParticipants.has(catcherId)) {
      increment(catchCountByProfile, catcherId);
      addToSetMap(uniqueCaughtFursuitsByProfile, catcherId, row.fursuit_id);

      const caughtMap = caughtFursuitsByProfile.get(catcherId) ?? new Map();
      const currentCaught = caughtMap.get(row.fursuit_id) ?? {
        name: fursuit?.name ?? null,
        count: 0,
      };
      currentCaught.count += 1;
      caughtMap.set(row.fursuit_id, currentCaught);
      caughtFursuitsByProfile.set(catcherId, caughtMap);
    }

    const ownerId = fursuit?.owner_id ?? null;
    if (ownerId && eligibleParticipants.has(ownerId)) {
      increment(ownFursuitCatchesByProfile, ownerId);
      addToSetMap(uniqueCatchersForOwnFursuitsByProfile, ownerId, catcherId);

      const ownMap = ownFursuitsByProfile.get(ownerId) ?? new Map();
      const currentOwn = ownMap.get(row.fursuit_id) ?? {
        name: fursuit?.name ?? null,
        timesCaught: 0,
        uniqueCatchers: new Set<string>(),
      };
      currentOwn.timesCaught += 1;
      currentOwn.uniqueCatchers.add(catcherId);
      ownMap.set(row.fursuit_id, currentOwn);
      ownFursuitsByProfile.set(ownerId, ownMap);
    }
  }

  for (const row of dailyProgress) {
    if (!eligibleParticipants.has(row.user_id)) {
      continue;
    }

    increment(dailyCompletionsByProfile, row.user_id);
    addToSetMap(dailyDaysByProfile, row.user_id, row.day);
  }

  for (const row of achievementUnlocks) {
    if (!eligibleParticipants.has(row.user_id)) {
      continue;
    }

    addToSetMap(achievementIdsByProfile, row.user_id, row.achievement_id);
  }

  const profiles = await loadProfiles([...participants]);
  const rankedProfiles = [...participants]
    .filter((profileId) => (catchCountByProfile.get(profileId) ?? 0) > 0)
    .sort((a, b) => {
      const catchDelta = (catchCountByProfile.get(b) ?? 0) - (catchCountByProfile.get(a) ?? 0);
      if (catchDelta !== 0) return catchDelta;

      const usernameA = profiles.get(a)?.username ?? '\uffff';
      const usernameB = profiles.get(b)?.username ?? '\uffff';
      const usernameDelta = usernameA.localeCompare(usernameB);
      if (usernameDelta !== 0) return usernameDelta;

      return a.localeCompare(b);
    });

  const rankByProfile = new Map<string, number>();
  rankedProfiles.forEach((profileId, index) => {
    rankByProfile.set(profileId, index + 1);
  });

  const recaps: RecapInsert[] = [...participants].map((profileId) => {
    const caughtFursuits = [...(caughtFursuitsByProfile.get(profileId)?.entries() ?? [])]
      .map(([fursuitId, value]) => ({
        fursuit_id: fursuitId,
        name: value.name,
        catch_count: value.count,
      }))
      .sort((a, b) => b.catch_count - a.catch_count || (a.name ?? '').localeCompare(b.name ?? ''))
      .slice(0, 10);

    const ownFursuits = [...(ownFursuitsByProfile.get(profileId)?.entries() ?? [])]
      .map(([fursuitId, value]) => ({
        fursuit_id: fursuitId,
        name: value.name,
        times_caught: value.timesCaught,
        unique_catchers: value.uniqueCatchers.size,
      }))
      .sort((a, b) => b.times_caught - a.times_caught || (a.name ?? '').localeCompare(b.name ?? ''))
      .slice(0, 10);

    const achievementIds = [...(achievementIdsByProfile.get(profileId) ?? new Set<string>())].slice(
      0,
      25,
    );

    return {
      convention_id: conventionId,
      profile_id: profileId,
      joined_at: joinedAtByProfile.get(profileId) ?? null,
      left_at: closedAt,
      final_rank: rankByProfile.get(profileId) ?? null,
      catch_count: catchCountByProfile.get(profileId) ?? 0,
      fursuits_caught_count: catchCountByProfile.get(profileId) ?? 0,
      unique_fursuits_caught_count: uniqueCaughtFursuitsByProfile.get(profileId)?.size ?? 0,
      own_fursuits_caught_count: ownFursuitCatchesByProfile.get(profileId) ?? 0,
      unique_catchers_for_own_fursuits_count:
        uniqueCatchersForOwnFursuitsByProfile.get(profileId)?.size ?? 0,
      daily_tasks_completed_count: dailyCompletionsByProfile.get(profileId) ?? 0,
      achievements_unlocked_count: achievementIdsByProfile.get(profileId)?.size ?? 0,
      generated_at: closedAt,
      summary: {
        fursuits_caught: caughtFursuits,
        own_fursuits: ownFursuits,
        achievement_ids: achievementIds,
        daily_task_days_completed: dailyDaysByProfile.get(profileId)?.size ?? 0,
      },
    };
  });

  return {
    recaps,
    acceptedCatchesCount: acceptedCatches.length,
    uniqueCatchersCount: new Set(acceptedCatches.map((row) => row.catcher_id)).size,
    uniqueFursuitsCaughtCount: new Set(acceptedCatches.map((row) => row.fursuit_id)).size,
  };
}

async function upsertRecaps(recaps: RecapInsert[]) {
  for (const recapChunk of chunk(recaps, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabaseAdmin
      .from('convention_participant_recaps')
      .upsert(recapChunk, { onConflict: 'convention_id,profile_id' });

    if (error) throw error;
  }
}

async function deleteStaleRecaps(conventionId: string, recaps: RecapInsert[]) {
  const validProfileIds = new Set(recaps.map((recap) => recap.profile_id));
  const existingRecaps = await fetchAll<ExistingRecapCleanupRow>((from, to) =>
    supabaseAdmin
      .from('convention_participant_recaps')
      .select('id, profile_id')
      .eq('convention_id', conventionId)
      .range(from, to),
  );
  const staleRecaps = existingRecaps.filter((recap) => !validProfileIds.has(recap.profile_id));
  const staleRecapIds = staleRecaps.map((recap) => recap.id);
  const staleProfileIds = staleRecaps.map((recap) => recap.profile_id);

  for (const recapIdChunk of chunk(staleRecapIds, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('type', 'convention_recap_ready')
      .in('payload->>recap_id', recapIdChunk);

    if (error) throw error;
  }

  for (const profileIdChunk of chunk(staleProfileIds, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabaseAdmin
      .from('convention_participant_recaps')
      .delete()
      .eq('convention_id', conventionId)
      .in('profile_id', profileIdChunk);

    if (error) throw error;
  }
}

async function replaceRecaps(conventionId: string, recaps: RecapInsert[]) {
  await upsertRecaps(recaps);
  await deleteStaleRecaps(conventionId, recaps);
}

async function loadRecapNotificationRows(conventionId: string) {
  return fetchAll<RecapNotificationRow>(async (from, to) => {
    const { data, error } = await supabaseAdmin
      .from('convention_participant_recaps')
      .select(
        [
          'id',
          'profile_id',
          'catch_count',
          'unique_fursuits_caught_count',
          'own_fursuits_caught_count',
          'achievements_unlocked_count',
        ].join(', '),
      )
      .eq('convention_id', conventionId)
      .range(from, to);

    return { data: data as unknown as RecapNotificationRow[] | null, error };
  });
}

async function createRecapNotifications(convention: ConventionRow) {
  const recaps = await loadRecapNotificationRows(convention.id);
  let inserted = 0;

  for (const recapChunk of chunk(recaps, 200)) {
    const results = await Promise.all(
      recapChunk.map(async (recap) => {
        const { data, error } = await supabaseAdmin.rpc(
          'insert_convention_recap_ready_notification_once',
          {
            p_user_id: recap.profile_id,
            p_payload: {
              recap_id: recap.id,
              convention_id: convention.id,
              convention_name: convention.name ?? 'your convention',
              catch_count: Number(recap.catch_count ?? 0),
              unique_fursuits_caught_count: Number(recap.unique_fursuits_caught_count ?? 0),
              own_fursuits_caught_count: Number(recap.own_fursuits_caught_count ?? 0),
              achievements_unlocked_count: Number(recap.achievements_unlocked_count ?? 0),
            },
          },
        );

        if (error) throw error;
        return data === true;
      }),
    );

    inserted += results.filter(Boolean).length;
  }

  return { notificationsCreated: inserted, recapsNotified: recaps.length };
}

async function finalizeDurableRows(conventionId: string, finalizedAt: string) {
  const [
    { data: activeMemberships, error: activeMembershipError },
    { data: historicalMemberships, error: historicalMembershipError },
    { data: activeAssignments, error: activeAssignmentError },
    { data: historicalAssignments, error: historicalAssignmentError },
  ] = await Promise.all([
    supabaseAdmin
      .from('profile_conventions')
      .update({
        attendance_state: 'finalized',
        active_until: finalizedAt,
        finalized_at: finalizedAt,
      })
      .eq('convention_id', conventionId)
      .eq('attendance_state', 'active')
      .is('active_until', null)
      .select('profile_id'),
    supabaseAdmin
      .from('profile_conventions')
      .update({ finalized_at: finalizedAt })
      .eq('convention_id', conventionId)
      .in('attendance_state', ['left', 'removed'])
      .is('finalized_at', null)
      .select('profile_id'),
    supabaseAdmin
      .from('fursuit_conventions')
      .update({
        roster_state: 'finalized',
        active_until: finalizedAt,
        finalized_at: finalizedAt,
      })
      .eq('convention_id', conventionId)
      .eq('roster_state', 'active')
      .is('active_until', null)
      .select('fursuit_id'),
    supabaseAdmin
      .from('fursuit_conventions')
      .update({ finalized_at: finalizedAt })
      .eq('convention_id', conventionId)
      .eq('roster_state', 'removed')
      .is('finalized_at', null)
      .select('fursuit_id'),
  ]);

  if (activeMembershipError) throw activeMembershipError;
  if (historicalMembershipError) throw historicalMembershipError;
  if (activeAssignmentError) throw activeAssignmentError;
  if (historicalAssignmentError) throw historicalAssignmentError;

  return {
    profileMembershipsFinalized: (activeMemberships ?? []).length,
    historicalProfileMembershipsStamped: (historicalMemberships ?? []).length,
    fursuitAssignmentsFinalized: (activeAssignments ?? []).length,
    historicalFursuitAssignmentsStamped: (historicalAssignments ?? []).length,
  };
}

async function claimCloseout(conventionId: string, source: CloseoutSource, current: ConventionRow) {
  const startedAt = new Date().toISOString();
  const baseUpdate = {
    status: 'closeout_running',
    closeout_started_at: startedAt,
    closeout_last_attempt_at: startedAt,
    closeout_completed_at: null,
    closeout_error: null,
  };

  let query = supabaseAdmin.from('conventions').update(baseUpdate).eq('id', conventionId);

  if (current.status === 'closed') {
    query = query.eq('status', 'closed');
  } else if (isRetrySource(source)) {
    query = query.eq('status', 'closeout_failed');
  } else {
    query = query.eq('status', 'finalizing');
    if (source === 'cron_close') {
      query = query.not('closeout_not_before', 'is', null).lte('closeout_not_before', startedAt);
    }
  }

  const { data, error } = await query
    .select(
      [
        'id',
        'name',
        'started_at',
        'geofence_enabled',
        'location_verification_required',
        'status',
        'closed_at',
        'archived_at',
        'finalizing_started_at',
        'closeout_not_before',
        'closeout_started_at',
        'closeout_completed_at',
        'closeout_last_attempt_at',
        'closeout_step',
        'closeout_retry_count',
        'closeout_summary',
      ].join(', '),
    )
    .limit(1);
  if (error) throw error;

  const claimed = ((data ?? []) as unknown as ConventionRow[])[0] ?? null;
  if (!claimed) {
    const refreshed = await loadConvention(conventionId);
    if (refreshed.status === 'closeout_running') {
      return { claimed: null, alreadyRunning: true, startedAt };
    }

    if (source === 'cron_close' && refreshed.status === 'finalizing') {
      return { claimed: null, notDue: true, startedAt };
    }
  }

  return { claimed, alreadyRunning: false, notDue: false, startedAt };
}

async function runCloseoutStep(
  convention: ConventionRow,
  step: CloseoutStep,
  source: CloseoutSource,
  closedAt: string,
) {
  await markStepRunning(convention.id, step);

  if (step === 'pending_expired') {
    const result = await expirePendingCatches(convention.id);
    await updateCloseoutSummary(convention.id, {
      pending_catches_expired: result.expiredCount,
      stale_pending_upload_catches_expired: result.stalePendingUploadCount,
    });
    return;
  }

  if (step === 'gameplay_queue_drained') {
    const result = await drainGameplayQueue();
    await updateCloseoutSummary(convention.id, {
      gameplay_queue_drain_attempts: result.attempts,
      gameplay_queue_drained: result.drained,
    });
    return;
  }

  if (step === 'recaps_generated') {
    const recapBuild = await buildRecaps(convention, closedAt);
    await replaceRecaps(convention.id, recapBuild.recaps);
    await updateCloseoutSummary(convention.id, {
      participants_count: recapBuild.recaps.length,
      recaps_generated: recapBuild.recaps.length,
      accepted_catches_count: recapBuild.acceptedCatchesCount,
      unique_catchers_count: recapBuild.uniqueCatchersCount,
      unique_fursuits_caught_count: recapBuild.uniqueFursuitsCaughtCount,
    });
    return;
  }

  if (step === 'notifications_created') {
    const notificationResult = await createRecapNotifications(convention);
    await updateCloseoutSummary(convention.id, {
      recap_notifications_created: notificationResult.notificationsCreated,
      recap_notifications_targeted: notificationResult.recapsNotified,
    });
    return;
  }

  const archivedAt = new Date().toISOString();
  const finalizeResult = await finalizeDurableRows(convention.id, archivedAt);
  const latest = await loadConvention(convention.id);
  const latestSummary = toSummary(latest.closeout_summary);
  const summary: CloseoutSummary = {
    convention_id: convention.id,
    source,
    closed_at: closedAt,
    archived_at: archivedAt,
    participants_count: Number(latestSummary.participants_count ?? 0),
    recaps_generated: Number(latestSummary.recaps_generated ?? 0),
    pending_catches_expired: Number(latestSummary.pending_catches_expired ?? 0),
    stale_pending_upload_catches_expired: Number(
      latestSummary.stale_pending_upload_catches_expired ?? 0,
    ),
    recap_notifications_created: Number(latestSummary.recap_notifications_created ?? 0),
    profile_memberships_finalized: finalizeResult.profileMembershipsFinalized,
    fursuit_assignments_finalized: finalizeResult.fursuitAssignmentsFinalized,
    historical_profile_memberships_stamped: finalizeResult.historicalProfileMembershipsStamped,
    historical_fursuit_assignments_stamped: finalizeResult.historicalFursuitAssignmentsStamped,
    accepted_catches_count: Number(latestSummary.accepted_catches_count ?? 0),
    unique_catchers_count: Number(latestSummary.unique_catchers_count ?? 0),
    unique_fursuits_caught_count: Number(latestSummary.unique_fursuits_caught_count ?? 0),
    steps_completed: [...closeoutSteps],
  };

  const { error } = await supabaseAdmin
    .from('conventions')
    .update({
      status: 'archived',
      closed_at: closedAt,
      archived_at: archivedAt,
      closeout_completed_at: archivedAt,
      closeout_last_attempt_at: archivedAt,
      closeout_step: 'archived',
      closeout_retry_count: 0,
      closeout_error: null,
      closeout_summary: summary,
    })
    .eq('id', convention.id)
    .eq('status', 'closeout_running');

  if (error) throw error;
}

async function regenerateArchivedRecaps(
  convention: ConventionRow,
  source: CloseoutSource,
  actorId: string,
  automation: boolean,
) {
  const closedAt = convention.closed_at ?? convention.archived_at ?? new Date().toISOString();
  const recapBuild = await buildRecaps(convention, closedAt);
  await replaceRecaps(convention.id, recapBuild.recaps);
  const archivedAt = convention.archived_at ?? new Date().toISOString();
  const summary = {
    ...toSummary(convention.closeout_summary),
    convention_id: convention.id,
    source,
    closed_at: closedAt,
    archived_at: archivedAt,
    participants_count: recapBuild.recaps.length,
    recaps_generated: recapBuild.recaps.length,
    accepted_catches_count: recapBuild.acceptedCatchesCount,
    unique_catchers_count: recapBuild.uniqueCatchersCount,
    unique_fursuits_caught_count: recapBuild.uniqueFursuitsCaughtCount,
  };

  const { error } = await supabaseAdmin
    .from('conventions')
    .update({
      status: 'archived',
      archived_at: archivedAt,
      closeout_error: null,
      closeout_summary: summary,
    })
    .eq('id', convention.id);

  if (error) throw error;

  await writeAudit(actorId, convention.id, 'regenerate_convention_recaps_complete', {
    ...summary,
    actor_id: actorId,
    automation,
    previous_status: convention.status,
    final_status: 'archived',
  });

  return {
    convention_id: convention.id,
    status: 'archived',
    already_archived: true,
    summary,
    recaps_generated: recapBuild.recaps.length,
    pending_catches_expired: 0,
    profile_memberships_finalized: 0,
    fursuit_assignments_finalized: 0,
  };
}

async function closeOutConvention(request: CloseoutRequest) {
  const conventionId = request.convention_id?.trim();
  const source = normalizeSource(request.source);
  const forceRegenerate = request.force_regenerate === true;
  const automation = isAutomationSource(source);
  const actorId = request.actor_id?.trim() || (automation ? automationActorId.trim() : '');

  if (!conventionId) throw new HttpError('convention_id is required.', 400);
  if (!actorId) {
    throw new HttpError(
      automation ? 'Automation actor is not configured.' : 'actor_id is required.',
      automation ? 500 : 400,
    );
  }

  const current = await loadConvention(conventionId);

  await writeAudit(
    actorId,
    conventionId,
    forceRegenerate ? 'regenerate_convention_recaps_attempt' : 'close_convention_attempt',
    {
      source,
      actor_id: actorId,
      automation,
      force_regenerate: forceRegenerate,
      convention_id: conventionId,
      previous_status: current.status,
      closeout_step: current.closeout_step,
      closeout_retry_count: current.closeout_retry_count ?? 0,
    },
  );

  if (current.status === 'archived') {
    if (forceRegenerate) {
      try {
        return await regenerateArchivedRecaps(current, source, actorId, automation);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recap regeneration failed.';
        await writeAudit(actorId, conventionId, 'regenerate_convention_recaps_failed', {
          source,
          actor_id: actorId,
          automation,
          convention_id: conventionId,
          previous_status: current.status,
          final_status: 'archived',
          error: message,
        });
        throw error;
      }
    }

    const summary = toSummary(current.closeout_summary);
    await writeAudit(actorId, conventionId, 'close_convention_noop', {
      source,
      actor_id: actorId,
      automation,
      convention_id: conventionId,
      previous_status: current.status,
      final_status: 'archived',
      summary,
    });
    return {
      convention_id: conventionId,
      status: 'archived',
      already_archived: true,
      summary,
      recaps_generated: Number(summary.recaps_generated ?? 0),
      pending_catches_expired: 0,
      profile_memberships_finalized: 0,
      fursuit_assignments_finalized: 0,
    };
  }

  if (
    current.status !== 'finalizing' &&
    current.status !== 'closeout_failed' &&
    current.status !== 'closed'
  ) {
    await writeAudit(actorId, conventionId, 'close_convention_failed', {
      source,
      actor_id: actorId,
      automation,
      convention_id: conventionId,
      previous_status: current.status,
      final_status: current.status,
      error: `Cannot close a convention with status ${current.status}.`,
    });
    throw new HttpError(`Cannot close a convention with status ${current.status}.`, 400);
  }

  if (current.status === 'closeout_failed' && (current.closeout_retry_count ?? 0) >= 5) {
    throw new HttpError('Closeout retry limit reached.', 409);
  }

  const claim = await claimCloseout(conventionId, source, current);

  if (claim.alreadyRunning) {
    await writeAudit(actorId, conventionId, 'close_convention_noop', {
      source,
      actor_id: actorId,
      automation,
      convention_id: conventionId,
      previous_status: current.status,
      final_status: 'closeout_running',
      reason: 'already_running',
    });
    return {
      convention_id: conventionId,
      status: 'closeout_running',
      already_running: true,
      already_archived: false,
      summary: toSummary(current.closeout_summary),
      recaps_generated: Number(current.closeout_summary?.recaps_generated ?? 0),
      pending_catches_expired: Number(current.closeout_summary?.pending_catches_expired ?? 0),
      profile_memberships_finalized: 0,
      fursuit_assignments_finalized: 0,
    };
  }

  if (claim.notDue) {
    await writeAudit(actorId, conventionId, 'close_convention_noop', {
      source,
      actor_id: actorId,
      automation,
      convention_id: conventionId,
      previous_status: current.status,
      final_status: current.status,
      reason: 'not_due',
      closeout_not_before: current.closeout_not_before,
    });
    return {
      convention_id: conventionId,
      status: current.status,
      not_due: true,
      already_archived: false,
      summary: toSummary(current.closeout_summary),
      recaps_generated: Number(current.closeout_summary?.recaps_generated ?? 0),
      pending_catches_expired: Number(current.closeout_summary?.pending_catches_expired ?? 0),
      profile_memberships_finalized: 0,
      fursuit_assignments_finalized: 0,
    };
  }

  const claimed = claim.claimed;
  if (!claimed) {
    throw new HttpError('Closeout could not be claimed.', 409);
  }

  const closedAt =
    current.closed_at ??
    current.finalizing_started_at ??
    claimed.closeout_started_at ??
    claim.startedAt;
  const startIndex = getNextStepIndex(current.status, current.closeout_step);
  let failedStep: CloseoutStep | null = null;
  let retryCountForFailure = current.closeout_retry_count ?? 0;

  try {
    for (const step of closeoutSteps.slice(startIndex)) {
      failedStep = step;
      await runCloseoutStep(claimed, step, source, closedAt);
      if (step !== 'archived') {
        await markStepComplete(conventionId, step);
        retryCountForFailure = 0;
      }
    }

    const finalConvention = await loadConvention(conventionId);
    const summary = toSummary(finalConvention.closeout_summary);

    await writeAudit(actorId, conventionId, 'close_convention_complete', {
      ...summary,
      actor_id: actorId,
      automation,
      previous_status: current.status,
      final_status: 'archived',
    });

    return {
      convention_id: conventionId,
      status: 'archived',
      already_archived: false,
      summary,
      recaps_generated: Number(summary.recaps_generated ?? 0),
      pending_catches_expired: Number(summary.pending_catches_expired ?? 0),
      profile_memberships_finalized: Number(summary.profile_memberships_finalized ?? 0),
      fursuit_assignments_finalized: Number(summary.fursuit_assignments_finalized ?? 0),
    };
  } catch (error) {
    const step =
      failedStep ??
      (isCloseoutStep(current.closeout_step) ? current.closeout_step : 'pending_expired');
    await markStepFailed(conventionId, step, retryCountForFailure, error);
    const message = error instanceof Error ? error.message : 'Closeout failed.';
    await writeAudit(actorId, conventionId, 'close_convention_failed', {
      source,
      actor_id: actorId,
      automation,
      convention_id: conventionId,
      previous_status: current.status,
      final_status: 'closeout_failed',
      closeout_step: step,
      error: message,
    });
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  let body: CloseoutRequest = {};

  try {
    assertServiceRole(req);
    body = (await req.json().catch(() => ({}))) as CloseoutRequest;
    const result = await closeOutConvention(body);
    return jsonResponse(200, result);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Closeout failed.';
    console.error('[close-out-convention] Request failed', {
      convention_id: body.convention_id ?? null,
      status,
      error,
    });
    return jsonResponse(status, { error: message });
  }
});
