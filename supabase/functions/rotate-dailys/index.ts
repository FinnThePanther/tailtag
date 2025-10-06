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

type RotateOptions = {
  day: string;
  requestedCount?: number;
  force: boolean;
};

function respondJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeCount(countParam: string | null): number | undefined {
  if (!countParam) return undefined;
  const parsed = Number.parseInt(countParam, 10);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < MIN_TASKS || parsed > MAX_TASKS) return undefined;
  return parsed;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function deriveSeed(
  day: string,
): Promise<{ seed: number; hashHex: string }> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(`${SEED_PREFIX}${day}`),
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  const dataView = new DataView(hashBuffer);
  const seed = dataView.getUint32(0, false); // take the first 32 bits as our seed

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

async function fetchAssignments(day: string): Promise<AssignmentWithTask[]> {
  const { data, error } = await supabaseAdmin
    .from("daily_assignments")
    .select(
      "position, task:daily_tasks (id, name, description, kind, requirement)",
    )
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

async function selectAssignments(day: string, requestedCount?: number) {
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

  const { seed, hashHex } = await deriveSeed(day);
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

async function storeAssignments(day: string, tasks: DailyTaskRow[]) {
  const payload = tasks.map((task, index) => ({
    day,
    task_id: task.id,
    position: index + 1,
  }));

  const { error: upsertError } = await supabaseAdmin
    .from("daily_assignments")
    .upsert(payload, { onConflict: "day,position" });

  if (upsertError) {
    throw new Error(
      `Unable to upsert daily assignments: ${upsertError.message}`,
    );
  }

  const { error: cleanupError } = await supabaseAdmin
    .from("daily_assignments")
    .delete()
    .eq("day", day)
    .gt("position", tasks.length);

  if (cleanupError) {
    throw new Error(
      `Unable to cleanup extra daily assignments: ${cleanupError.message}`,
    );
  }
}

async function rotateDailyTasks({ day, requestedCount, force }: RotateOptions) {
  const existing = await fetchAssignments(day);
  if (!force && existing.length >= MIN_TASKS) {
    return {
      assignments: existing,
      refreshed: false,
      seedHash: null,
    };
  }

  const { selected, desiredCount, hashHex } = await selectAssignments(
    day,
    requestedCount,
  );

  if (selected.length === 0) {
    throw new Error("No tasks selected for assignment");
  }

  await storeAssignments(day, selected);

  const finalAssignments = await fetchAssignments(day);
  if (finalAssignments.length !== desiredCount) {
    throw new Error("Mismatch between stored assignments and desired count");
  }

  return {
    assignments: finalAssignments,
    refreshed: true,
    seedHash: hashHex,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return respondJson({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const dayParam = url.searchParams.get("day");
  const countParam = url.searchParams.get("count");
  const forceParam = url.searchParams.get("force");

  const todayUtc = new Date();
  const force = forceParam === "true";

  let day = dayParam ? dayParam.trim() : formatUtcDay(todayUtc);
  if (!isIsoDate(day)) {
    return respondJson(
      { error: "Invalid day parameter; expected YYYY-MM-DD" },
      400,
    );
  }

  const requestedCount = sanitizeCount(countParam);

  try {
    const result = await rotateDailyTasks({ day, requestedCount, force });
    return respondJson({
      day,
      refreshed: result.refreshed,
      assignments: result.assignments,
      seed_hash: result.seedHash,
    });
  } catch (error) {
    console.error("Failed rotating daily tasks", error);
    return respondJson(
      { error: (error as Error).message ?? "Unknown error" },
      500,
    );
  }
});
