/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { ingestGameplayEvent } from '../_shared/gameplayQueue.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MIN_TASKS = 3;
const MAX_TASKS = 5;
const SEED_PREFIX = 'dailys:';

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

const textEncoder = new TextEncoder();
const systemEventUserId = Deno.env.get('SYSTEM_EVENT_USER_ID');
let missingSystemUserWarned = false;

async function emitDailyResetEvent(
  conventionId: string,
  day: string,
  seedHash: string | null,
): Promise<void> {
  if (!systemEventUserId) {
    if (!missingSystemUserWarned) {
      console.warn(
        '[rotate-dailys] SYSTEM_EVENT_USER_ID not configured; skipping daily_reset event emit',
      );
      missingSystemUserWarned = true;
    }
    return;
  }

  try {
    const occurredAt = new Date().toISOString();
    const ingestResult = await ingestGameplayEvent(supabaseAdmin, {
      type: 'daily_reset',
      userId: systemEventUserId,
      conventionId,
      payload: {
        convention_id: conventionId,
        day,
        seed_hash: seedHash,
      },
      occurredAt,
      idempotencyKey: `daily_reset:${conventionId}:${day}`,
    });

    console.log('[rotate-dailys] daily_reset event stored', {
      convention_id: conventionId,
      day,
      event_id: ingestResult.eventId,
      seed_hash: seedHash,
    });
  } catch (error) {
    console.error('[rotate-dailys] Failed to persist daily_reset event', {
      convention_id: conventionId,
      day,
      error,
    });
  }
}

type DailyTaskRow = {
  id: string;
  name: string;
  description: string;
  kind: string;
  requirement: number;
};

type AssignmentWithTask = {
  position: number;
  task: DailyTaskRow;
};

type ConventionRow = {
  id: string;
  timezone: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

type RotationSource = 'cron' | 'mobile_fallback' | 'manual' | 'admin_manual';

type RotateOptions = {
  conventionId?: string;
  requestedCount?: number;
  force: boolean;
  source: RotationSource;
};

type ConventionResult = {
  convention_id: string;
  day: string | null;
  refreshed: boolean;
  assignments: AssignmentWithTask[];
  seed_hash: string | null;
  skipped?: boolean;
  reason?: 'not_live' | 'outside_date_window';
  status?: string;
};

type AuditContext = {
  source: RotationSource;
  requested_count: number | null;
  force: boolean;
  status: string | null;
  eligible: boolean;
  reason: string | null;
  refreshed: boolean | null;
  assignment_count: number | null;
  error?: string;
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function respondJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

async function resolveActorId(req: Request, url: URL): Promise<string | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  if (token === serviceRoleKey) {
    const actorId = url.searchParams.get('actor_id');
    return actorId?.trim() || null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    console.warn('[rotate-dailys] Unable to resolve actor from bearer token', {
      error: error?.message ?? 'Unknown auth error',
    });
    return null;
  }

  return data.user.id;
}

function parseSource(sourceParam: string | null, hasTarget: boolean): RotationSource {
  if (
    sourceParam === 'cron' ||
    sourceParam === 'mobile_fallback' ||
    sourceParam === 'manual' ||
    sourceParam === 'admin_manual'
  ) {
    return sourceParam;
  }

  return hasTarget ? 'manual' : 'cron';
}

function shouldAudit(source: RotationSource): boolean {
  return source === 'manual' || source === 'admin_manual';
}

async function writeRotationAudit(
  actorId: string | null,
  conventionId: string | null,
  context: AuditContext,
): Promise<void> {
  if (!actorId || !conventionId) {
    console.warn('[rotate-dailys] Skipping manual rotation audit without actor or convention', {
      actor_id_present: Boolean(actorId),
      convention_id: conventionId,
      ...context,
    });
    return;
  }

  const { error } = await supabaseAdmin.from('audit_log').insert({
    actor_id: actorId,
    action: 'rotate_daily_tasks_attempt',
    entity_type: 'convention',
    entity_id: conventionId,
    context,
  });

  if (error) {
    console.error('[rotate-dailys] Failed to write rotation audit row', {
      convention_id: conventionId,
      actor_id: actorId,
      error: error.message,
    });
  }
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(timezone: string) {
  if (!dateFormatterCache.has(timezone)) {
    dateFormatterCache.set(
      timezone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );
  }
  return dateFormatterCache.get(timezone)!;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function getLocalDay(
  now: Date,
  timezone: string,
): {
  day: string;
  year: number;
  month: number;
  dayNumber: number;
} {
  const formatter = getDateFormatter(timezone);
  const parts = formatter.formatToParts(now);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const dayNumber = Number(lookup.day);
  return {
    day: `${year}-${pad(month)}-${pad(dayNumber)}`,
    year,
    month,
    dayNumber,
  };
}

function sanitizeCount(countParam: string | null): number | undefined {
  if (!countParam) return undefined;
  const parsed = Number.parseInt(countParam, 10);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < MIN_TASKS || parsed > MAX_TASKS) return undefined;
  return parsed;
}

async function deriveSeed(
  conventionId: string,
  day: string,
): Promise<{ seed: number; hashHex: string }> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(`${SEED_PREFIX}${conventionId}:${day}`),
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  const dataView = new DataView(hashBuffer);
  const seed = dataView.getUint32(0, false);

  return { seed, hashHex };
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let m = Math.imul(t ^ (t >>> 15), 1 | t);
    m ^= m + Math.imul(m ^ (m >>> 7), 61 | m);
    return ((m ^ (m >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

async function fetchAssignments(conventionId: string, day: string): Promise<AssignmentWithTask[]> {
  const { data, error } = await supabaseAdmin
    .from('daily_assignments')
    .select('position, task:daily_tasks (id, name, description, kind, requirement)')
    .eq('convention_id', conventionId)
    .eq('day', day)
    .order('position', { ascending: true });

  if (error) {
    throw new Error(`Unable to fetch daily assignments: ${error.message}`);
  }

  const assignments: AssignmentWithTask[] = [];
  for (const row of data ?? []) {
    const task = row.task as unknown as DailyTaskRow | null;
    if (!task) continue;
    assignments.push({
      position: row.position as number,
      task,
    });
  }

  return assignments;
}

async function fetchTaskPool(conventionId: string | null): Promise<DailyTaskRow[]> {
  let query = supabaseAdmin
    .from('daily_tasks')
    .select('id, name, description, kind, requirement')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (conventionId === null) {
    query = (query as any).is('convention_id', null);
  } else {
    query = query.eq('convention_id', conventionId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to fetch daily tasks: ${error.message}`);
  }
  return (data ?? []) as DailyTaskRow[];
}

async function selectAssignments(conventionId: string, day: string, requestedCount?: number) {
  const [globalTasks, conventionTasks] = await Promise.all([
    fetchTaskPool(null),
    fetchTaskPool(conventionId),
  ]);

  const candidatePool =
    conventionTasks.length >= MIN_TASKS
      ? [...conventionTasks]
      : [...conventionTasks, ...globalTasks];
  const totalPool = candidatePool.length;
  if (totalPool < MIN_TASKS) {
    throw new Error(
      `Insufficient active daily tasks (${totalPool}); need at least ${MIN_TASKS} to rotate`,
    );
  }

  const { seed, hashHex } = await deriveSeed(conventionId, day);
  const rng = mulberry32(seed);

  const maxAllowed = Math.min(MAX_TASKS, totalPool);
  const desiredCount = requestedCount
    ? Math.min(maxAllowed, Math.max(MIN_TASKS, requestedCount))
    : MIN_TASKS + Math.floor(rng() * (maxAllowed - MIN_TASKS + 1));

  shuffleInPlace(candidatePool, rng);
  const selected = candidatePool.slice(0, desiredCount);

  return { selected, desiredCount, hashHex };
}

async function storeAssignments(conventionId: string, day: string, tasks: DailyTaskRow[]) {
  const payload = tasks.map((task, index) => ({
    day,
    convention_id: conventionId,
    task_id: task.id,
    position: index + 1,
  }));

  const { error: upsertError } = await supabaseAdmin
    .from('daily_assignments')
    .upsert(payload, { onConflict: 'convention_id,day,position' });

  if (upsertError) {
    throw new Error(`Unable to upsert daily assignments: ${upsertError.message}`);
  }

  const { error: cleanupError } = await supabaseAdmin
    .from('daily_assignments')
    .delete()
    .eq('convention_id', conventionId)
    .eq('day', day)
    .gt('position', tasks.length);

  if (cleanupError) {
    throw new Error(`Unable to cleanup extra daily assignments: ${cleanupError.message}`);
  }
}

async function fetchConventions(targetId?: string): Promise<ConventionRow[]> {
  let query = supabaseAdmin
    .from('conventions')
    .select('id, timezone, status, start_date, end_date');

  if (targetId) {
    query = query.eq('id', targetId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to fetch conventions: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: (row as { id: string }).id,
    timezone: (row as { timezone?: string | null }).timezone ?? 'UTC',
    status: (row as { status?: string | null }).status ?? 'draft',
    start_date: (row as { start_date?: string | null }).start_date ?? null,
    end_date: (row as { end_date?: string | null }).end_date ?? null,
  }));
}

function getRotationEligibility(
  convention: ConventionRow,
  nowUtc: Date,
): {
  eligible: boolean;
  day: string;
  reason: 'not_live' | 'outside_date_window' | null;
} {
  const localInfo = getLocalDay(nowUtc, convention.timezone);
  const localDay = localInfo.day;

  if (convention.status !== 'live') {
    return { eligible: false, day: localDay, reason: 'not_live' };
  }

  if (
    (convention.start_date && localDay < convention.start_date) ||
    (convention.end_date && localDay > convention.end_date)
  ) {
    return { eligible: false, day: localDay, reason: 'outside_date_window' };
  }

  return { eligible: true, day: localDay, reason: null };
}

function skippedResult(
  convention: ConventionRow,
  day: string,
  reason: 'not_live' | 'outside_date_window',
): ConventionResult {
  return {
    convention_id: convention.id,
    day,
    refreshed: false,
    skipped: true,
    reason,
    status: convention.status,
    assignments: [],
    seed_hash: null,
  };
}

async function rotateConvention(
  convention: ConventionRow,
  requestedCount: number | undefined,
  force: boolean,
): Promise<ConventionResult> {
  const nowUtc = new Date();
  const eligibility = getRotationEligibility(convention, nowUtc);
  const localDay = eligibility.day;

  if (!eligibility.eligible && eligibility.reason) {
    return skippedResult(convention, localDay, eligibility.reason);
  }

  const existing = await fetchAssignments(convention.id, localDay);

  if (!force && existing.length >= MIN_TASKS) {
    return {
      convention_id: convention.id,
      day: localDay,
      refreshed: false,
      assignments: existing,
      seed_hash: null,
      status: convention.status,
    };
  }

  const { selected, desiredCount, hashHex } = await selectAssignments(
    convention.id,
    localDay,
    requestedCount,
  );

  if (selected.length === 0) {
    throw new Error(`No tasks selected for convention ${convention.id}`);
  }

  await storeAssignments(convention.id, localDay, selected);

  const finalAssignments = await fetchAssignments(convention.id, localDay);
  if (finalAssignments.length !== desiredCount) {
    throw new Error('Mismatch between stored assignments and desired count');
  }

  await emitDailyResetEvent(convention.id, localDay, hashHex);

  return {
    convention_id: convention.id,
    day: localDay,
    refreshed: true,
    assignments: finalAssignments,
    seed_hash: hashHex,
    status: convention.status,
  };
}

async function rotateDailyTasks({
  conventionId,
  requestedCount,
  force,
}: RotateOptions): Promise<ConventionResult[]> {
  const conventions = await fetchConventions(conventionId);
  if (conventions.length === 0) {
    if (conventionId) {
      throw new HttpError('Convention not found.', 404);
    }
    return [];
  }

  const results: ConventionResult[] = [];
  for (const convention of conventions) {
    if (!conventionId) {
      const eligibility = getRotationEligibility(convention, new Date());
      if (!eligibility.eligible) {
        continue;
      }
    }
    const result = await rotateConvention(convention, requestedCount, force);
    results.push(result);
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return respondJson({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(req.url);
  const conventionParam = url.searchParams.get('convention_id');
  const countParam = url.searchParams.get('count');
  const forceParam = url.searchParams.get('force');

  const requestedCount = sanitizeCount(countParam);
  const force = forceParam === 'true';
  const source = parseSource(url.searchParams.get('source'), Boolean(conventionParam));
  const auditEnabled = shouldAudit(source);
  const actorId = auditEnabled ? await resolveActorId(req, url) : null;

  try {
    const results = await rotateDailyTasks({
      conventionId: conventionParam ?? undefined,
      requestedCount,
      force,
      source,
    });

    if (auditEnabled) {
      for (const result of results) {
        await writeRotationAudit(actorId, result.convention_id, {
          source,
          requested_count: requestedCount ?? null,
          force,
          status: result.status ?? null,
          eligible: result.skipped !== true,
          reason: result.reason ?? null,
          refreshed: result.refreshed,
          assignment_count: result.assignments.length,
        });
      }
    }

    return respondJson({ results });
  } catch (error) {
    console.error('Failed rotating daily tasks', error);
    const message = (error as Error).message ?? 'Unknown error';
    const status = error instanceof HttpError ? error.status : 500;

    if (auditEnabled) {
      await writeRotationAudit(actorId, conventionParam, {
        source,
        requested_count: requestedCount ?? null,
        force,
        status: null,
        eligible: false,
        reason: null,
        refreshed: null,
        assignment_count: null,
        error: message,
      });
    }

    return respondJson({ error: message }, status);
  }
});
