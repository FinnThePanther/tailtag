/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MIN_TASKS = 3;
const MAX_TASKS = 5;
const SEED_PREFIX = "dailys:";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SERVICE_ROLE_KEY environment variables",
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const textEncoder = new TextEncoder();
const systemEventUserId = Deno.env.get("SYSTEM_EVENT_USER_ID");
let missingSystemUserWarned = false;

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

type EventRow = {
  event_id: string;
  user_id: string;
  type: string;
  convention_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
};

async function emitDailyResetEvent(
  conventionId: string,
  day: string,
  seedHash: string | null,
): Promise<void> {
  if (!systemEventUserId) {
    if (!missingSystemUserWarned) {
      console.warn("[rotate-dailys] SYSTEM_EVENT_USER_ID not configured; skipping daily_reset event emit");
      missingSystemUserWarned = true;
    }
    return;
  }

  const eventRow: EventRow = {
    event_id: generateUuidV7(),
    user_id: systemEventUserId,
    type: "daily_reset",
    convention_id: conventionId,
    payload: {
      convention_id: conventionId,
      day,
      seed_hash: seedHash,
    },
    occurred_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("events")
    .insert([eventRow]);

  if (error) {
    console.error("[rotate-dailys] Failed to persist daily_reset event", {
      convention_id: conventionId,
      day,
      error,
    });
  } else {
    console.log("[rotate-dailys] daily_reset event stored", {
      convention_id: conventionId,
      day,
      event_id: eventRow.event_id,
      seed_hash: seedHash,
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
};

type RotateOptions = {
  conventionId?: string;
  requestedCount?: number;
  force: boolean;
};

type ConventionResult = {
  convention_id: string;
  day: string;
  refreshed: boolean;
  assignments: AssignmentWithTask[];
  seed_hash: string | null;
};

function respondJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

function getLocalDay(now: Date, timezone: string): {
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
    "SHA-256",
    textEncoder.encode(`${SEED_PREFIX}${conventionId}:${day}`),
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
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

async function fetchAssignments(
  conventionId: string,
  day: string,
): Promise<AssignmentWithTask[]> {
  const { data, error } = await supabaseAdmin
    .from("daily_assignments")
    .select(
      "position, task:daily_tasks (id, name, description, kind, requirement)",
    )
    .eq("convention_id", conventionId)
    .eq("day", day)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Unable to fetch daily assignments: ${error.message}`);
  }

  const assignments: AssignmentWithTask[] = [];
  for (const row of data ?? []) {
    const task = row.task as DailyTaskRow | null;
    if (!task) continue;
    assignments.push({
      position: row.position as number,
      task,
    });
  }

  return assignments;
}

async function selectAssignments(
  conventionId: string,
  day: string,
  requestedCount?: number,
) {
  const { data: activeTasks, error } = await supabaseAdmin
    .from("daily_tasks")
    .select("id, name, description, kind, requirement")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Unable to fetch active daily tasks: ${error.message}`);
  }

  const tasks = (activeTasks ?? []) as DailyTaskRow[];
  if (tasks.length < MIN_TASKS) {
    throw new Error(
      `Insufficient active daily tasks (${tasks.length}); need at least ${MIN_TASKS} to rotate`,
    );
  }

  const { seed, hashHex } = await deriveSeed(conventionId, day);
  const rng = mulberry32(seed);

  const maxAllowed = Math.min(MAX_TASKS, tasks.length);
  const desiredCount = requestedCount
    ? Math.min(maxAllowed, Math.max(MIN_TASKS, requestedCount))
    : MIN_TASKS + Math.floor(rng() * (maxAllowed - MIN_TASKS + 1));

  const tasksCopy = [...tasks];
  shuffleInPlace(tasksCopy, rng);
  const selected = tasksCopy.slice(0, desiredCount);

  return { selected, desiredCount, hashHex };
}

async function storeAssignments(
  conventionId: string,
  day: string,
  tasks: DailyTaskRow[],
) {
  const payload = tasks.map((task, index) => ({
    day,
    convention_id: conventionId,
    task_id: task.id,
    position: index + 1,
  }));

  const { error: upsertError } = await supabaseAdmin
    .from("daily_assignments")
    .upsert(payload, { onConflict: "convention_id,day,position" });

  if (upsertError) {
    throw new Error(
      `Unable to upsert daily assignments: ${upsertError.message}`,
    );
  }

  const { error: cleanupError } = await supabaseAdmin
    .from("daily_assignments")
    .delete()
    .eq("convention_id", conventionId)
    .eq("day", day)
    .gt("position", tasks.length);

  if (cleanupError) {
    throw new Error(
      `Unable to cleanup extra daily assignments: ${cleanupError.message}`,
    );
  }
}

async function fetchConventions(targetId?: string): Promise<ConventionRow[]> {
  let query = supabaseAdmin
    .from("conventions")
    .select("id, timezone")
    .not("timezone", "is", null);

  if (targetId) {
    query = query.eq("id", targetId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to fetch conventions: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: (row as { id: string }).id,
    timezone: ((row as { timezone?: string | null }).timezone ?? "UTC"),
  }));
}

async function rotateConvention(
  convention: ConventionRow,
  requestedCount: number | undefined,
  force: boolean,
): Promise<ConventionResult> {
  const nowUtc = new Date();
  const localInfo = getLocalDay(nowUtc, convention.timezone);
  const localDay = localInfo.day;

  const existing = await fetchAssignments(convention.id, localDay);

  if (!force && existing.length >= MIN_TASKS) {
    return {
      convention_id: convention.id,
      day: localDay,
      refreshed: false,
      assignments: existing,
      seed_hash: null,
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
    throw new Error("Mismatch between stored assignments and desired count");
  }

  await emitDailyResetEvent(convention.id, localDay, hashHex);

  return {
    convention_id: convention.id,
    day: localDay,
    refreshed: true,
    assignments: finalAssignments,
    seed_hash: hashHex,
  };
}

async function rotateDailyTasks({
  conventionId,
  requestedCount,
  force,
}: RotateOptions): Promise<ConventionResult[]> {
  const conventions = await fetchConventions(conventionId);
  if (conventions.length === 0) {
    throw new Error("No conventions available to rotate");
  }

  const results: ConventionResult[] = [];
  for (const convention of conventions) {
    const result = await rotateConvention(convention, requestedCount, force);
    results.push(result);
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return respondJson({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const conventionParam = url.searchParams.get("convention_id");
  const countParam = url.searchParams.get("count");
  const forceParam = url.searchParams.get("force");

  const requestedCount = sanitizeCount(countParam);
  const force = forceParam === "true";

  try {
    const results = await rotateDailyTasks({
      conventionId: conventionParam ?? undefined,
      requestedCount,
      force,
    });

    return respondJson({ results });
  } catch (error) {
    console.error("Failed rotating daily tasks", error);
    return respondJson({ error: (error as Error).message ?? "Unknown error" }, 500);
  }
});
