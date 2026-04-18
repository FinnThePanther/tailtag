/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAGE_SIZE = 1000;
const UPSERT_CHUNK_SIZE = 500;

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY environment variables');
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type CloseoutSource = 'admin_close' | 'admin_retry' | 'admin_regenerate';

type CloseoutRequest = {
  convention_id?: string;
  actor_id?: string;
  source?: CloseoutSource;
  force_regenerate?: boolean;
};

type ConventionRow = {
  id: string;
  status: string;
  closed_at: string | null;
  archived_at: string | null;
  closeout_summary: Record<string, unknown> | null;
};

type ProfileConventionRow = {
  profile_id: string;
  created_at: string | null;
};

type ExistingRecapRow = {
  profile_id: string;
  joined_at: string | null;
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

type CloseoutSummary = {
  convention_id: string;
  source: CloseoutSource;
  closed_at: string;
  archived_at: string;
  participants_count: number;
  recaps_generated: number;
  pending_catches_expired: number;
  profile_memberships_removed: number;
  fursuit_assignments_removed: number;
  accepted_catches_count: number;
  unique_catchers_count: number;
  unique_fursuits_caught_count: number;
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
  if (source === 'admin_regenerate') return 'admin_regenerate';
  return source === 'admin_retry' ? 'admin_retry' : 'admin_close';
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

async function expirePendingCatches(conventionId: string) {
  const { data, error } = await supabaseAdmin
    .from('catches')
    .update({
      status: 'EXPIRED',
      decided_at: new Date().toISOString(),
    })
    .eq('convention_id', conventionId)
    .eq('status', 'PENDING')
    .select('id');

  if (error) throw error;
  return (data ?? []).length;
}

async function removeActiveRows(conventionId: string) {
  const [{ data: memberships, error: membershipError }, { data: assignments, error: rosterError }] =
    await Promise.all([
      supabaseAdmin.from('profile_conventions').delete().eq('convention_id', conventionId).select(),
      supabaseAdmin.from('fursuit_conventions').delete().eq('convention_id', conventionId).select(),
    ]);

  if (membershipError) throw membershipError;
  if (rosterError) throw rosterError;

  return {
    profileMembershipsRemoved: (memberships ?? []).length,
    fursuitAssignmentsRemoved: (assignments ?? []).length,
  };
}

async function buildRecaps(conventionId: string, closedAt: string) {
  const [memberships, existingRecaps, acceptedCatches, dailyProgress, achievementUnlocks] =
    await Promise.all([
      fetchAll<ProfileConventionRow>((from, to) =>
        supabaseAdmin
          .from('profile_conventions')
          .select('profile_id, created_at')
          .eq('convention_id', conventionId)
          .range(from, to),
      ),
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
          .eq('is_tutorial', false)
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
    participants.add(row.profile_id);
    if (row.joined_at) joinedAtByProfile.set(row.profile_id, row.joined_at);
  }

  for (const row of memberships) {
    participants.add(row.profile_id);
    joinedAtByProfile.set(
      row.profile_id,
      row.created_at ?? joinedAtByProfile.get(row.profile_id) ?? null,
    );
  }

  for (const row of acceptedCatches) {
    const catcherId = row.catcher_id;
    const fursuit = normalizeFursuit(row);
    participants.add(catcherId);
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

    const ownerId = fursuit?.owner_id ?? null;
    if (ownerId) {
      participants.add(ownerId);
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
    participants.add(row.user_id);
    increment(dailyCompletionsByProfile, row.user_id);
    addToSetMap(dailyDaysByProfile, row.user_id, row.day);
  }

  for (const row of achievementUnlocks) {
    participants.add(row.user_id);
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

async function closeOutConvention(request: CloseoutRequest) {
  const conventionId = request.convention_id?.trim();
  const actorId = request.actor_id?.trim();
  const source = normalizeSource(request.source);
  const forceRegenerate = request.force_regenerate === true;

  if (!conventionId) throw new HttpError('convention_id is required.', 400);
  if (!actorId) throw new HttpError('actor_id is required.', 400);

  await writeAudit(
    actorId,
    conventionId,
    forceRegenerate ? 'regenerate_convention_recaps_attempt' : 'close_convention_attempt',
    { source, force_regenerate: forceRegenerate },
  );

  const { data: convention, error: conventionError } = await supabaseAdmin
    .from('conventions')
    .select('id, status, closed_at, archived_at, closeout_summary')
    .eq('id', conventionId)
    .single();

  if (conventionError) throw conventionError;
  if (!convention) throw new HttpError('Convention not found.', 404);

  const current = convention as ConventionRow;

  if (current.status === 'archived') {
    if (forceRegenerate) {
      try {
        const closedAt = current.closed_at ?? current.archived_at ?? new Date().toISOString();
        const recapBuild = await buildRecaps(conventionId, closedAt);
        await upsertRecaps(recapBuild.recaps);
        const archivedAt = current.archived_at ?? new Date().toISOString();
        const summary: CloseoutSummary = {
          convention_id: conventionId,
          source,
          closed_at: closedAt,
          archived_at: archivedAt,
          participants_count: recapBuild.recaps.length,
          recaps_generated: recapBuild.recaps.length,
          pending_catches_expired: 0,
          profile_memberships_removed: 0,
          fursuit_assignments_removed: 0,
          accepted_catches_count: recapBuild.acceptedCatchesCount,
          unique_catchers_count: recapBuild.uniqueCatchersCount,
          unique_fursuits_caught_count: recapBuild.uniqueFursuitsCaughtCount,
        };

        const { error: updateError } = await supabaseAdmin
          .from('conventions')
          .update({
            status: 'archived',
            archived_at: archivedAt,
            closeout_error: null,
            closeout_summary: summary,
          })
          .eq('id', conventionId);

        if (updateError) throw updateError;

        await writeAudit(actorId, conventionId, 'regenerate_convention_recaps_complete', summary);

        return {
          convention_id: conventionId,
          status: 'archived',
          already_archived: true,
          summary,
          recaps_generated: summary.recaps_generated,
          pending_catches_expired: 0,
          profile_memberships_removed: 0,
          fursuit_assignments_removed: 0,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recap regeneration failed.';
        await writeAudit(actorId, conventionId, 'regenerate_convention_recaps_failed', {
          source,
          error: message,
        });
        throw error;
      }
    }

    const summary = current.closeout_summary ?? {};
    await writeAudit(actorId, conventionId, 'close_convention_noop', {
      source,
      status: 'archived',
      summary,
    });
    return {
      convention_id: conventionId,
      status: 'archived',
      already_archived: true,
      summary,
      recaps_generated: Number(summary.recaps_generated ?? 0),
      pending_catches_expired: 0,
      profile_memberships_removed: 0,
      fursuit_assignments_removed: 0,
    };
  }

  if (current.status !== 'live' && current.status !== 'closed') {
    throw new HttpError(`Cannot close a convention with status ${current.status}.`, 400);
  }

  const closedAt = current.closed_at ?? new Date().toISOString();

  const { error: closeError } = await supabaseAdmin
    .from('conventions')
    .update({
      status: 'closed',
      closed_at: closedAt,
      closeout_error: null,
    })
    .eq('id', conventionId);

  if (closeError) throw closeError;

  try {
    const pendingCatchesExpired = await expirePendingCatches(conventionId);
    const recapBuild = await buildRecaps(conventionId, closedAt);
    await upsertRecaps(recapBuild.recaps);
    const removalResult = await removeActiveRows(conventionId);
    const archivedAt = new Date().toISOString();

    const summary: CloseoutSummary = {
      convention_id: conventionId,
      source,
      closed_at: closedAt,
      archived_at: archivedAt,
      participants_count: recapBuild.recaps.length,
      recaps_generated: recapBuild.recaps.length,
      pending_catches_expired: pendingCatchesExpired,
      profile_memberships_removed: removalResult.profileMembershipsRemoved,
      fursuit_assignments_removed: removalResult.fursuitAssignmentsRemoved,
      accepted_catches_count: recapBuild.acceptedCatchesCount,
      unique_catchers_count: recapBuild.uniqueCatchersCount,
      unique_fursuits_caught_count: recapBuild.uniqueFursuitsCaughtCount,
    };

    const { error: archiveError } = await supabaseAdmin
      .from('conventions')
      .update({
        status: 'archived',
        archived_at: archivedAt,
        closeout_error: null,
        closeout_summary: summary,
      })
      .eq('id', conventionId);

    if (archiveError) throw archiveError;

    await writeAudit(actorId, conventionId, 'close_convention_complete', summary);

    return {
      convention_id: conventionId,
      status: 'archived',
      already_archived: false,
      summary,
      recaps_generated: summary.recaps_generated,
      pending_catches_expired: summary.pending_catches_expired,
      profile_memberships_removed: summary.profile_memberships_removed,
      fursuit_assignments_removed: summary.fursuit_assignments_removed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Closeout failed.';
    await supabaseAdmin
      .from('conventions')
      .update({
        status: 'closed',
        closed_at: closedAt,
        closeout_error: message,
      })
      .eq('id', conventionId);
    await writeAudit(actorId, conventionId, 'close_convention_failed', {
      source,
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
