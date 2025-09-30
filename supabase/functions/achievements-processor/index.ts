/// <reference lib="deno.unstable" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Json = Record<string, unknown>;

type Achievement = {
  id: string;
  key: string;
  recipient_role: "catcher" | "fursuit_owner" | "any";
};

type AchievementEvent = {
  id: string;
  event_type: "catch.created" | "profile.updated" | "convention.checkin";
  payload: Json;
  created_at: string;
  processed_at: string | null;
};

type CatchEventPayload = {
  catch_id: string;
  catcher_id: string;
  fursuit_id: string;
  fursuit_owner_id?: string | null;
  convention_id?: string | null;
  caught_at: string;
};

type ProfileUpdatedPayload = {
  user_id: string;
};

type ConventionCheckinPayload = {
  user_id: string;
  convention_id: string;
};

type CatchRow = {
  id: string;
  catcher_id: string;
  fursuit_id: string;
  convention_id: string | null;
  caught_at: string;
  fursuit: {
    id: string;
    owner_id: string | null;
    species: string | null;
    species_id: string | null;
  } | null;
  convention?: {
    id: string;
    slug: string | null;
    start_date: string | null;
    end_date: string | null;
    timezone: string | null;
  } | null;
};

type AwardResult = {
  key: string;
  userId: string;
  awarded: boolean;
};

type ProcessResult = {
  eventId: string;
  eventType: AchievementEvent["event_type"];
  awards: AwardResult[];
  skipped?: boolean;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY environment variables");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/** Utility to fetch achievements by key once per request */
async function loadAchievementMap(): Promise<Map<string, Achievement>> {
  const { data, error } = await supabaseAdmin
    .from("achievements")
    .select("id, key, recipient_role")
    .eq("is_active", true);

  if (error) {
    console.error("Failed to fetch achievements", error);
    throw new Error(`Unable to fetch achievements catalog: ${error.message}`);
  }

  const map = new Map<string, Achievement>();
  for (const row of data ?? []) {
    map.set(row.key, row as Achievement);
  }
  return map;
}

async function claimNextEvents(limit: number): Promise<AchievementEvent[]> {
  const { data, error } = await supabaseAdmin
    .from("achievement_events")
    .select("id, event_type, payload, created_at, processed_at")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Error fetching achievement events", error);
    throw new Error(`Unable to fetch achievement events: ${error.message}`);
  }

  return (data ?? []) as AchievementEvent[];
}

async function markEventProcessed(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("achievement_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("processed_at", null);

  if (error) {
    console.error(`Failed to mark event ${eventId} as processed`, error);
    throw new Error(`Unable to mark event ${eventId} as processed: ${error.message}`);
  }
}

async function fetchCatchWithRelations(catchId: string): Promise<CatchRow | null> {
  const baseSelect =
    "id, catcher_id, fursuit_id, convention_id, caught_at, fursuit:fursuits(id, owner_id, species, species_id)";

  let query = supabaseAdmin
    .from("catches")
    .select(baseSelect)
    .eq("id", catchId)
    .maybeSingle();

  let { data, error } = await query;

  if (error && error.code === "42703") {
    // convention_id column missing – retry without it.
    ({ data, error } = await supabaseAdmin
      .from("catches")
      .select(
        "id, catcher_id, fursuit_id, caught_at, fursuit:fursuits(id, owner_id, species, species_id)"
      )
      .eq("id", catchId)
      .maybeSingle());
  }

  if (error) {
    console.error(`Error fetching catch ${catchId}`, error);
    throw new Error(`Unable to fetch catch ${catchId}: ${error.message}`);
  }

  if (!data) return null;

  const row = data as {
    id: string;
    catcher_id: string;
    fursuit_id: string;
    caught_at: string;
    convention_id?: string | null;
    fursuit: CatchRow["fursuit"];
  } | null;

  if (!row) return null;

  let convention: CatchRow["convention"] = null;
  const conventionId = row.convention_id ?? null;

  if (conventionId) {
    const { data: conventionData, error: conventionError } = await supabaseAdmin
      .from("conventions")
      .select("id, slug, start_date, end_date, timezone")
      .eq("id", conventionId)
      .maybeSingle();

    if (conventionError) {
      if (!["42P01", "42703"].includes(conventionError.code ?? "")) {
        console.error(`Error fetching convention ${conventionId}`, conventionError);
        throw new Error(
          `Unable to fetch convention ${conventionId}: ${conventionError.message}`,
        );
      }
    } else {
      convention = (conventionData as CatchRow["convention"]) ?? null;
    }
  }

  return {
    id: row.id,
    catcher_id: row.catcher_id,
    fursuit_id: row.fursuit_id,
    convention_id: conventionId,
    caught_at: row.caught_at,
    fursuit: row.fursuit ?? null,
    convention,
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
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    hour: parseInt(lookup.hour, 10),
    minute: parseInt(lookup.minute, 10),
  };
}

async function countCatchesByUser(userId: string): Promise<number> {
  const { error, count } = await supabaseAdmin
    .from("catches")
    .select("id", { count: "exact", head: true })
    .eq("catcher_id", userId);

  if (error) {
    console.error(`Failed counting catches for user ${userId}`, error);
    throw new Error(`Unable to count catches for user ${userId}: ${error.message}`);
  }

  return count ?? 0;
}

async function countDistinctSpeciesCaught(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("catches")
    .select("fursuit:fursuits(species_id,species)")
    .eq("catcher_id", userId);

  if (error) {
    console.error(`Failed counting species for user ${userId}`, error);
    throw new Error(`Unable to count species for user ${userId}: ${error.message}`);
  }

  const speciesSet = new Set<string>();
  for (const row of data ?? []) {
    const fursuit = (row as { fursuit: { species_id: string | null; species: string | null } | null }).fursuit;
    if (!fursuit) continue;
    if (fursuit.species_id) {
      speciesSet.add(fursuit.species_id);
    } else if (fursuit.species) {
      speciesSet.add(fursuit.species.trim().toLowerCase());
    }
  }
  return speciesSet.size;
}

async function hasHybridOrMultiSpecies(fursuitId: string, speciesName: string | null, speciesId: string | null): Promise<boolean> {
  if (speciesName && speciesName.toLowerCase().includes("hybrid")) {
    return true;
  }

  // Try presence of flag on species table if available
  if (speciesId) {
    const { data, error } = await supabaseAdmin
      .from("fursuit_species")
      .select("is_hybrid")
      .eq("id", speciesId)
      .maybeSingle();

    if (!error && data && (data as { is_hybrid?: boolean }).is_hybrid === true) {
      return true;
    }
  }

  // If many-to-many mapping exists, treat >1 species as multi-species
  const { error: mapError, count } = await supabaseAdmin
    .from("fursuit_species_map")
    .select("species_id", { count: "exact", head: true })
    .eq("fursuit_id", fursuitId);

  if (mapError && mapError.code === "42P01") {
    // relation does not exist – ignore silently
    return false;
  }

  if (mapError) {
    console.error(`Failed checking species map for fursuit ${fursuitId}`, mapError);
    throw new Error(`Unable to verify species mapping for fursuit ${fursuitId}: ${mapError.message}`);
  }

  return (count ?? 0) > 1;
}

async function countDistinctConventionsForUser(userId: string): Promise<number> {
  const { error, data } = await supabaseAdmin
    .from("catches")
    .select("convention_id")
    .eq("catcher_id", userId)
    .not("convention_id", "is", null);

  if (error) {
    if (error.code === "42703") {
      // convention_id column missing; treat as zero eligible conventions
      return 0;
    }
    console.error(`Failed counting conventions for user ${userId}`, error);
    throw new Error(`Unable to count conventions for user ${userId}: ${error.message}`);
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const conventionId = (row as { convention_id?: string | null }).convention_id;
    if (conventionId) ids.add(conventionId);
  }
  return ids.size;
}

async function countCatchesForFursuit(fursuitId: string): Promise<number> {
  const { error, count } = await supabaseAdmin
    .from("catches")
    .select("id", { count: "exact", head: true })
    .eq("fursuit_id", fursuitId);

  if (error) {
    console.error(`Failed counting catches for fursuit ${fursuitId}`, error);
    throw new Error(`Unable to count catches for fursuit ${fursuitId}: ${error.message}`);
  }

  return count ?? 0;
}

async function countCatchesForFursuitAtConvention(fursuitId: string, conventionId: string): Promise<number> {
  const query = supabaseAdmin
    .from("catches")
    .select("id", { count: "exact", head: true })
    .eq("fursuit_id", fursuitId)
    .eq("convention_id", conventionId);

  const { error, count } = await query;

  if (error) {
    if (error.code === "42703") {
      // convention_id column missing
      return 0;
    }
    console.error(`Failed counting catches for fursuit ${fursuitId} at convention ${conventionId}`, error);
    throw new Error(`Unable to count catches for fursuit ${fursuitId} at convention ${conventionId}: ${error.message}`);
  }

  return count ?? 0;
}

async function countUniqueCatchersForFursuitAtConvention(fursuitId: string, conventionId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("catches")
    .select("catcher_id")
    .eq("fursuit_id", fursuitId)
    .eq("convention_id", conventionId);

  if (error) {
    if (error.code === "42703") {
      return Number.MAX_SAFE_INTEGER; // If convention_id missing, skip awarding Rare Find
    }
    console.error(`Failed counting unique catchers for fursuit ${fursuitId} at convention ${conventionId}`, error);
    throw new Error(`Unable to count unique catchers for fursuit ${fursuitId} at convention ${conventionId}: ${error.message}`);
  }

  const uniqueCatchers = new Set<string>();
  for (const row of data ?? []) {
    const catcher = (row as { catcher_id?: string | null }).catcher_id;
    if (catcher) uniqueCatchers.add(catcher);
  }
  return uniqueCatchers.size;
}

async function hasSecondCatchWithinMinute(userId: string, caughtAtIso: string): Promise<boolean> {
  const caughtAt = new Date(caughtAtIso);
  const windowStart = new Date(caughtAt.getTime() - 60_000).toISOString();
  const windowEnd = caughtAt.toISOString();

  const { error, data } = await supabaseAdmin
    .from("catches")
    .select("id, caught_at")
    .eq("catcher_id", userId)
    .gte("caught_at", windowStart)
    .lte("caught_at", windowEnd)
    .order("caught_at", { ascending: true });

  if (error) {
    console.error(`Failed checking double trouble window for ${userId}`, error);
    throw new Error(`Unable to check double trouble window for ${userId}: ${error.message}`);
  }

  return (data?.length ?? 0) >= 2;
}

async function awardAchievement(userId: string, achievement: Achievement, context: Json): Promise<boolean> {
  if (!userId) return false;

  const payload = {
    user_id: userId,
    achievement_id: achievement.id,
    context,
  };

  const { error } = await supabaseAdmin
    .from("user_achievements")
    .upsert(payload, {
      onConflict: "user_id,achievement_id",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error(`Failed awarding ${achievement.key} to user ${userId}`, error);
    throw new Error(`Unable to award ${achievement.key} to user ${userId}: ${error.message}`);
  }

  return true;
}

async function processCatchEvent(
  achievementMap: Map<string, Achievement>,
  event: AchievementEvent
): Promise<AwardResult[]> {
  const payload = event.payload as CatchEventPayload;
  if (!payload?.catch_id) {
    console.warn(`Skipping catch event ${event.id} due to missing catch_id`);
    return [];
  }

  const catchRow = await fetchCatchWithRelations(payload.catch_id);
  if (!catchRow) {
    console.warn(`Catch ${payload.catch_id} not found; marking event as processed`);
    return [];
  }

  const contextBase: Json = {
    catch_id: catchRow.id,
    fursuit_id: catchRow.fursuit_id,
  };
  if (catchRow.convention_id ?? catchRow.convention?.id) {
    contextBase.convention_id = catchRow.convention_id ?? catchRow.convention?.id ?? undefined;
  }

  const awards: AwardResult[] = [];

  // Catcher focused achievements
  if (catchRow.catcher_id) {
    const catcherContext = { ...contextBase };
    const catcherAwards = await evaluateCatcherAchievements(
      achievementMap,
      catchRow,
      catcherContext
    );
    awards.push(...catcherAwards);
  }

  // Owner achievements
  const ownerId = catchRow.fursuit?.owner_id ?? payload.fursuit_owner_id ?? null;
  if (ownerId) {
    const ownerContext = { ...contextBase, owner_id: ownerId };
    const ownerAwards = await evaluateOwnerAchievements(
      achievementMap,
      catchRow,
      ownerId,
      ownerContext
    );
    awards.push(...ownerAwards);
  }

  return awards;
}

async function evaluateCatcherAchievements(
  achievementMap: Map<string, Achievement>,
  catchRow: CatchRow,
  context: Json
): Promise<AwardResult[]> {
  const userId = catchRow.catcher_id;
  const awards: AwardResult[] = [];

  const totalCatches = await countCatchesByUser(userId);

  const thresholds: Array<{ key: string; count: number }> = [
    { key: "FIRST_CATCH", count: 1 },
    { key: "GETTING_THE_HANG_OF_IT", count: 10 },
    { key: "SUPER_CATCHER", count: 25 },
  ];

  for (const { key, count } of thresholds) {
    if (totalCatches >= count) {
      const achievement = achievementMap.get(key);
      if (achievement && achievement.recipient_role === "catcher") {
        const awarded = await awardAchievement(userId, achievement, context);
        awards.push({ key, userId, awarded });
      }
    }
  }

  const speciesCount = await countDistinctSpeciesCaught(userId);
  if (speciesCount >= 5) {
    const achievement = achievementMap.get("SUIT_SAMPLER");
    if (achievement && achievement.recipient_role === "catcher") {
      const awarded = await awardAchievement(userId, achievement, context);
      awards.push({ key: "SUIT_SAMPLER", userId, awarded });
    }
  }

  const hybrid = await hasHybridOrMultiSpecies(
    catchRow.fursuit?.id ?? catchRow.fursuit_id,
    catchRow.fursuit?.species ?? null,
    catchRow.fursuit?.species_id ?? null
  );
  if (hybrid) {
    const achievement = achievementMap.get("MIX_AND_MATCH");
    if (achievement && achievement.recipient_role === "catcher") {
      const awarded = await awardAchievement(userId, achievement, context);
      awards.push({ key: "MIX_AND_MATCH", userId, awarded });
    }
  }

  // Convention aware achievements
  const conventionId = catchRow.convention_id ?? catchRow.convention?.id ?? null;
  if (conventionId && catchRow.convention) {
    const local = toLocalParts(catchRow.caught_at, catchRow.convention.timezone);
    if (catchRow.convention.start_date && local.date === catchRow.convention.start_date) {
      const achievement = achievementMap.get("DAY_ONE_DEVOTEE");
      if (achievement && achievement.recipient_role === "catcher") {
        const awarded = await awardAchievement(userId, achievement, context);
        awards.push({ key: "DAY_ONE_DEVOTEE", userId, awarded });
      }
    }

    if (local.hour >= 22) {
      const achievement = achievementMap.get("NIGHT_OWL");
      if (achievement && achievement.recipient_role === "catcher") {
        const awarded = await awardAchievement(userId, achievement, context);
        awards.push({ key: "NIGHT_OWL", userId, awarded });
      }
    }

    const conventionCount = await countDistinctConventionsForUser(userId);
    if (conventionCount >= 3) {
      const achievement = achievementMap.get("WORLD_TOUR");
      if (achievement && achievement.recipient_role === "catcher") {
        const awarded = await awardAchievement(userId, achievement, context);
        awards.push({ key: "WORLD_TOUR", userId, awarded });
      }
    }

    const uniqueCatchers = await countUniqueCatchersForFursuitAtConvention(
      catchRow.fursuit_id,
      conventionId
    );
    if (uniqueCatchers < 10) {
      const achievement = achievementMap.get("RARE_FIND");
      if (achievement && achievement.recipient_role === "catcher") {
        const awarded = await awardAchievement(userId, achievement, context);
        awards.push({ key: "RARE_FIND", userId, awarded });
      }
    }
  }

  const doubleTrouble = await hasSecondCatchWithinMinute(userId, catchRow.caught_at);
  if (doubleTrouble) {
    const achievement = achievementMap.get("DOUBLE_TROUBLE");
    if (achievement && achievement.recipient_role === "catcher") {
      const awarded = await awardAchievement(userId, achievement, context);
      awards.push({ key: "DOUBLE_TROUBLE", userId, awarded });
    }
  }

  return awards;
}

async function evaluateOwnerAchievements(
  achievementMap: Map<string, Achievement>,
  catchRow: CatchRow,
  ownerId: string,
  context: Json
): Promise<AwardResult[]> {
  const awards: AwardResult[] = [];

  const totalForFursuit = await countCatchesForFursuit(catchRow.fursuit_id);
  if (totalForFursuit >= 1) {
    const achievement = achievementMap.get("DEBUT_PERFORMANCE");
    if (achievement && achievement.recipient_role === "fursuit_owner") {
      const awarded = await awardAchievement(ownerId, achievement, context);
      awards.push({ key: "DEBUT_PERFORMANCE", userId: ownerId, awarded });
    }
  }

  const conventionId = catchRow.convention_id ?? catchRow.convention?.id ?? null;
  if (conventionId) {
    const countAtConvention = await countCatchesForFursuitAtConvention(
      catchRow.fursuit_id,
      conventionId
    );
    if (countAtConvention >= 25) {
      const achievement = achievementMap.get("FAN_FAVORITE");
      if (achievement && achievement.recipient_role === "fursuit_owner") {
        const awarded = await awardAchievement(ownerId, achievement, context);
        awards.push({ key: "FAN_FAVORITE", userId: ownerId, awarded });
      }
    }
  }

  return awards;
}

async function processProfileUpdatedEvent(
  achievementMap: Map<string, Achievement>,
  event: AchievementEvent
): Promise<AwardResult[]> {
  const payload = event.payload as ProfileUpdatedPayload;
  const userId = payload?.user_id;
  if (!userId) {
    console.warn(`Profile updated event ${event.id} missing user_id`);
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("username, bio, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error(`Failed fetching profile for ${userId}`, error);
    throw new Error(`Unable to fetch profile for ${userId}: ${error.message}`);
  }

  const profile = data as { username: string | null; bio: string | null; avatar_url: string | null } | null;
  if (!profile) return [];

  const filled = Boolean(profile.username && profile.username.trim().length > 0)
    && Boolean(profile.bio && profile.bio.trim().length > 0)
    && Boolean(profile.avatar_url && profile.avatar_url.trim().length > 0);

  if (!filled) return [];

  const achievement = achievementMap.get("PROFILE_COMPLETE");
  if (!achievement || achievement.recipient_role !== "any") return [];

  const awarded = await awardAchievement(userId, achievement, { user_id: userId });
  return [{ key: "PROFILE_COMPLETE", userId, awarded }];
}

async function processConventionCheckinEvent(
  achievementMap: Map<string, Achievement>,
  event: AchievementEvent
): Promise<AwardResult[]> {
  const payload = event.payload as ConventionCheckinPayload;
  const userId = payload?.user_id;
  if (!userId) {
    console.warn(`Convention checkin event ${event.id} missing user_id`);
    return [];
  }

  const achievement = achievementMap.get("EXPLORER");
  if (!achievement || achievement.recipient_role !== "any") return [];

  const context: Json = {
    user_id: userId,
  };
  if (payload.convention_id) context.convention_id = payload.convention_id;

  const awarded = await awardAchievement(userId, achievement, context);
  return [{ key: "EXPLORER", userId, awarded }];
}

async function processEvent(
  achievementMap: Map<string, Achievement>,
  event: AchievementEvent
): Promise<ProcessResult> {
  const result: ProcessResult = {
    eventId: event.id,
    eventType: event.event_type,
    awards: [],
  };

  switch (event.event_type) {
    case "catch.created": {
      result.awards = await processCatchEvent(achievementMap, event);
      break;
    }
    case "profile.updated": {
      result.awards = await processProfileUpdatedEvent(achievementMap, event);
      break;
    }
    case "convention.checkin": {
      result.awards = await processConventionCheckinEvent(achievementMap, event);
      break;
    }
    default:
      console.warn(`Unhandled event type ${event.event_type}`);
      result.skipped = true;
  }

  await markEventProcessed(event.id);
  return result;
}

type BatchOptions = {
  limitPerBatch?: number;
  maxBatches?: number;
};

async function processPendingEvents({
  limitPerBatch = 25,
  maxBatches = 10,
}: BatchOptions = {}): Promise<{ processed: number; results: ProcessResult[] }> {
  const achievementMap = await loadAchievementMap();
  const allResults: ProcessResult[] = [];
  let totalProcessed = 0;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const events = await claimNextEvents(limitPerBatch);

    if (events.length === 0) {
      break;
    }

    for (const event of events) {
      try {
        const processed = await processEvent(achievementMap, event);
        totalProcessed += 1;
        allResults.push(processed);
      } catch (eventError) {
        console.error(`Failed processing event ${event.id}`, eventError);
        const { error } = await supabaseAdmin
          .from("achievement_events")
          .update({ processed_at: null })
          .eq("id", event.id);
        if (error) {
          console.error(`Failed resetting processed_at for ${event.id}`, error);
        }
      }
    }

    if (events.length < limitPerBatch) {
      break;
    }
  }

  return { processed: totalProcessed, results: allResults };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const maxBatchesParam = url.searchParams.get("max_batches");
  const limit = limitParam ? Math.max(1, Math.min(100, Number.parseInt(limitParam, 10) || 0)) : 25;
  const maxBatches = maxBatchesParam
    ? Math.max(1, Math.min(40, Number.parseInt(maxBatchesParam, 10) || 0))
    : 10;

  try {
    const { processed, results } = await processPendingEvents({
      limitPerBatch: limit,
      maxBatches,
    });

    return new Response(
      JSON.stringify({ processed, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Unexpected error running achievements processor", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

export { processPendingEvents };
