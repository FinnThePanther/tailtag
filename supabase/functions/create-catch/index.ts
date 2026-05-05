/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: create-catch
 *
 * Handles catch creation with approval mode support.
 * Creates catches with appropriate status based on the owner's profile settings.
 */

// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import {
  ingestGameplayEvent,
  loadGameplayQueueConfig,
  scheduleGameplayQueueDrain,
} from '../_shared/gameplayQueue.ts';
import { processAchievementsForEvent } from '../_shared/achievements.ts';
import type { InsertableEventRow } from '../_shared/types.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('ANON_KEY');
const serviceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error('Missing Supabase configuration');
}

const resolvedSupabaseUrl = supabaseUrl;
const resolvedSupabaseAnonKey = supabaseAnonKey;
const resolvedServiceRoleKey = serviceRoleKey;

const supabaseAdmin = createClient(resolvedSupabaseUrl, resolvedServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface CreateCatchRequest {
  fursuit_id: string;
  convention_id?: string | null;
  is_tutorial?: boolean;
  force_pending?: boolean;
}

interface UpdateCatchPhotoRequest {
  catch_id: string;
  catch_photo_path?: string;
  catch_photo_url: string;
}

interface CreateCatchResponse {
  catch_id: string;
  status: string;
  expires_at: string | null;
  catch_number: number | null;
  requires_approval: boolean;
  fursuit_owner_id: string;
  convention_id?: string | null;
}

type FursuitMakerMetadata = {
  makerNames: string[];
  normalizedMakerNames: string[];
  hasSelfMadeMaker: boolean;
};

const SELF_MADE_MAKER_ALIASES = [
  'self-made',
  'self made',
  'selfmade',
  'handmade',
  'hand made',
  'owner-made',
  'owner made',
  'made by me',
  'me',
  'myself',
];
const GENERIC_MAKER_MATCH_EXCLUSIONS = ['self-made', 'made by me'];

type InlineEventRow = {
  event_id: string;
  user_id: string;
  convention_id: string | null;
  type: string;
  payload: Record<string, unknown> | null;
  occurred_at: string;
  processed_at: string | null;
  queue_message_id: number | string | null;
};

function parseQueueMessageId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

async function processEventInline(eventId: string): Promise<{
  processed: boolean;
  awards: unknown[];
}> {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('event_id,user_id,convention_id,type,payload,occurred_at,processed_at,queue_message_id')
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load event ${eventId}: ${error.message}`);
  }

  const row = (data ?? null) as InlineEventRow | null;

  if (!row) {
    return { processed: false, awards: [] };
  }

  if (row.processed_at) {
    return { processed: false, awards: [] };
  }

  const eventRow: InsertableEventRow = {
    event_id: row.event_id,
    user_id: row.user_id,
    convention_id: row.convention_id,
    type: row.type,
    payload: row.payload ?? {},
    occurred_at: row.occurred_at,
  };

  const processResult = await processAchievementsForEvent(supabaseAdmin, eventRow);
  const now = new Date().toISOString();

  const { error: stampError } = await supabaseAdmin
    .from('events')
    .update({
      retry_count: 0,
      processed_at: now,
      last_attempted_at: now,
      last_error: null,
    })
    .eq('event_id', eventId)
    .is('processed_at', null);

  if (stampError) {
    console.error('[create-catch] Failed to stamp processed event after inline processing', {
      eventId,
      error: stampError,
    });
  }

  const queueMessageId = parseQueueMessageId(row.queue_message_id);
  if (queueMessageId !== null) {
    const { error: queueDeleteError } = await supabaseAdmin.rpc(
      'delete_gameplay_event_queue_message',
      {
        p_message_id: queueMessageId,
      },
    );
    if (queueDeleteError) {
      console.error('[create-catch] Failed deleting queue message after inline processing', {
        eventId,
        queueMessageId,
        error: queueDeleteError,
      });
    }
  }

  return {
    processed: true,
    awards: processResult.awards,
  };
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

async function fetchFursuitMakerMetadata(fursuitId: string): Promise<FursuitMakerMetadata> {
  const { data, error } = await supabaseAdmin
    .from('fursuit_makers')
    .select('maker_name,normalized_maker_name')
    .eq('fursuit_id', fursuitId)
    .order('position', { ascending: true });

  if (error) {
    console.error('[create-catch] Failed loading fursuit makers:', error);
    return { makerNames: [], normalizedMakerNames: [], hasSelfMadeMaker: false };
  }

  const makerNames: string[] = [];
  const normalizedMakerNames: string[] = [];
  for (const row of data ?? []) {
    if (typeof row.maker_name === 'string' && row.maker_name.trim().length > 0) {
      makerNames.push(row.maker_name);
    }
    if (
      typeof row.normalized_maker_name === 'string' &&
      row.normalized_maker_name.trim().length > 0
    ) {
      normalizedMakerNames.push(row.normalized_maker_name.trim().toLowerCase());
    }
  }

  return {
    makerNames,
    normalizedMakerNames,
    hasSelfMadeMaker: normalizedMakerNames.some((maker) => SELF_MADE_MAKER_ALIASES.includes(maker)),
  };
}

async function hasCatcherOwnedMakerMatch(
  catcherId: string,
  normalizedMakerNames: string[],
): Promise<boolean> {
  if (normalizedMakerNames.length === 0) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from('fursuits')
    .select('id,makers:fursuit_makers(normalized_maker_name)')
    .eq('owner_id', catcherId)
    .limit(20000);

  if (error) {
    console.error('[create-catch] Failed loading catcher-owned makers:', error);
    return false;
  }

  const targetMakers = new Set(normalizedMakerNames);
  for (const suit of data ?? []) {
    const makers = (suit.makers ?? []) as Array<{ normalized_maker_name?: unknown }>;
    for (const maker of makers) {
      const normalizedMakerName =
        typeof maker.normalized_maker_name === 'string'
          ? maker.normalized_maker_name.trim().toLowerCase()
          : '';
      if (GENERIC_MAKER_MATCH_EXCLUSIONS.includes(normalizedMakerName)) {
        continue;
      }
      if (targetMakers.has(normalizedMakerName)) {
        return true;
      }
    }
  }

  return false;
}

async function hasNewMakerForCatcherAtConvention(options: {
  catcherId: string;
  conventionId: string | null;
  catchId: string;
  normalizedMakerNames: string[];
}): Promise<boolean> {
  if (!options.conventionId || options.normalizedMakerNames.length === 0) {
    return false;
  }

  const { data, error } = await supabaseAdmin.rpc('has_new_maker_for_catcher_at_convention', {
    p_catcher_id: options.catcherId,
    p_convention_id: options.conventionId,
    p_catch_id: options.catchId,
    p_normalized_maker_names: options.normalizedMakerNames,
  });

  if (error) {
    console.error('[create-catch] Failed checking previous maker catch:', error);
    return false;
  }

  return data === true;
}

async function resolveCreatedCatchConventionId(
  result: CreateCatchResponse,
  fallbackConventionId: string | null,
): Promise<string | null> {
  if (typeof result.convention_id === 'string' && result.convention_id.length > 0) {
    return result.convention_id;
  }

  const { data, error } = await supabaseAdmin
    .from('catches')
    .select('convention_id')
    .eq('id', result.catch_id)
    .maybeSingle();

  if (error) {
    console.error('[create-catch] Failed resolving created catch convention:', error);
    return fallbackConventionId;
  }

  return data?.convention_id ?? fallbackConventionId;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    console.error('[create-catch] Failed to resolve user from bearer token', {
      error: error?.message ?? 'Unknown auth error',
    });
    return null;
  }

  return data.user.id;
}

async function handlePost(req: Request): Promise<Response> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  let body: CreateCatchRequest;
  try {
    body = (await req.json()) as CreateCatchRequest;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload' });
  }

  if (!body.fursuit_id) {
    return jsonResponse(400, { error: 'Missing fursuit_id' });
  }

  try {
    // Check if catcher and fursuit owner have blocked each other
    const { data: fursuitRow } = await supabaseAdmin
      .from('fursuits')
      .select('owner_id')
      .eq('id', body.fursuit_id)
      .single();

    if (fursuitRow?.owner_id) {
      const { data: blocked } = await supabaseAdmin.rpc('is_blocked', {
        p_user_a: userId,
        p_user_b: fursuitRow.owner_id,
      });

      if (blocked === true) {
        return jsonResponse(403, { error: 'Cannot catch this fursuit' });
      }
    }

    // Call the create_catch_with_approval function. The RPC reads the fursuit owner's
    // profile-level catch mode preference.
    const { data, error } = await supabaseAdmin.rpc('create_catch_with_approval', {
      p_fursuit_id: body.fursuit_id,
      p_catcher_id: userId,
      p_convention_id: body.convention_id || null,
      p_is_tutorial: body.is_tutorial || false,
      p_force_pending: body.force_pending || false,
    });

    if (error) {
      // Handle specific error cases
      if (error.message?.includes('Cannot catch your own fursuit')) {
        return jsonResponse(400, { error: 'Cannot catch your own fursuit' });
      }
      if (error.message?.includes('already caught')) {
        return jsonResponse(400, { error: 'Fursuit already caught at this convention' });
      }
      if (error.message?.includes('Convention is not live')) {
        return jsonResponse(400, { error: 'Convention is not live' });
      }
      if (
        error.message?.includes('Catcher must join the live convention') ||
        error.message?.includes('Fursuit owner must join the live convention') ||
        error.message?.includes('Fursuit must be assigned to the live convention')
      ) {
        return jsonResponse(400, {
          error: 'You and this fursuit must share a playable convention before catching.',
        });
      }
      if (error.message?.includes('not found')) {
        return jsonResponse(404, { error: 'Fursuit not found' });
      }

      console.error('[create-catch] RPC error:', error);
      return jsonResponse(500, { error: 'Failed to create catch' });
    }

    const result = data as CreateCatchResponse;
    const resolvedConventionId = await resolveCreatedCatchConventionId(
      result,
      body.convention_id ?? null,
    );

    // Fetch fursuit metadata (species + colors) for enriching the event payload.
    // Also fetch fursuit name + catcher username for owner-facing notifications.
    // These run in parallel so we don't add latency.
    let speciesName: string | null = null;
    let colorNames: string[] = [];
    let makerMetadata: FursuitMakerMetadata = {
      makerNames: [],
      normalizedMakerNames: [],
      hasSelfMadeMaker: false,
    };
    let hasMakerMatchWithCatcherOwnedSuit = false;
    let isNewMakerForCatcherAtConvention = false;
    const shouldNotifyPendingCatch = result.requires_approval && !body.force_pending;
    const shouldNotifyAcceptedCatch =
      !result.requires_approval && !body.force_pending && !body.is_tutorial;

    try {
      const fursuitPromise = (async () =>
        await supabaseAdmin
          .from('fursuits')
          .select('name, species:fursuit_species(name)')
          .eq('id', body.fursuit_id)
          .single())();
      const colorsPromise = (async () =>
        await supabaseAdmin
          .from('fursuit_color_assignments')
          .select('color:fursuit_colors(name)')
          .eq('fursuit_id', body.fursuit_id)
          .order('position', { ascending: true }))();
      const makersPromise = fetchFursuitMakerMetadata(body.fursuit_id);
      // For photo catches (force_pending = true), the notification is sent after the
      // photo URL is attached (PATCH handler), so we skip fetching catcher here.
      const catcherPromise =
        shouldNotifyPendingCatch || shouldNotifyAcceptedCatch
          ? (async () =>
              await supabaseAdmin.from('profiles').select('username').eq('id', userId).single())()
          : Promise.resolve(undefined);

      const [fursuitResult, colorsResult, makerResult, catcherResult] = await Promise.all([
        fursuitPromise,
        colorsPromise,
        makersPromise,
        catcherPromise,
      ]);

      const speciesRow = Array.isArray(fursuitResult.data?.species)
        ? fursuitResult.data?.species[0]
        : fursuitResult.data?.species;

      speciesName = speciesRow?.name ?? null;
      colorNames = (colorsResult.data ?? [])
        .map((row) => {
          const colorRow = Array.isArray(row.color) ? row.color[0] : row.color;
          return colorRow?.name;
        })
        .filter((name): name is string => !!name);
      makerMetadata = makerResult;
      const [makerMatch, hasNewMaker] = await Promise.all([
        hasCatcherOwnedMakerMatch(userId, makerMetadata.normalizedMakerNames),
        hasNewMakerForCatcherAtConvention({
          catcherId: userId,
          conventionId: resolvedConventionId,
          catchId: result.catch_id,
          normalizedMakerNames: makerMetadata.normalizedMakerNames,
        }),
      ]);
      hasMakerMatchWithCatcherOwnedSuit = makerMatch;
      isNewMakerForCatcherAtConvention = hasNewMaker;

      // Send approval notification for non-photo catches only.
      // Photo catches (force_pending = true) delay notification until after the photo URL
      // is attached in the PATCH handler, so the owner sees the photo immediately.
      if (shouldNotifyPendingCatch && fursuitResult.data && catcherResult?.data) {
        const { error: notifError } = await supabaseAdmin.rpc('notify_catch_pending', {
          p_catch_id: result.catch_id,
          p_fursuit_owner_id: result.fursuit_owner_id,
          p_catcher_id: userId,
          p_fursuit_name: fursuitResult.data.name,
          p_catcher_username: catcherResult.data.username || 'Someone',
        });

        if (notifError) {
          console.error('[create-catch] Failed to send notification:', notifError);
        }
      }

      if (shouldNotifyAcceptedCatch && fursuitResult.data && catcherResult?.data) {
        const { error: notifError } = await supabaseAdmin.from('notifications').insert({
          user_id: result.fursuit_owner_id,
          type: 'fursuit_caught',
          payload: {
            catch_id: result.catch_id,
            catcher_id: userId,
            fursuit_id: body.fursuit_id,
            fursuit_name: fursuitResult.data.name,
            catcher_username: catcherResult.data.username || 'Someone',
            convention_id: resolvedConventionId,
          },
        });

        if (notifError) {
          console.error('[create-catch] Failed to send accepted catch notification:', notifError);
        }
      }
    } catch (metadataError) {
      console.error('[create-catch] Metadata/notification error:', metadataError);
      // Don't fail the catch creation if metadata fetch fails
    }

    // Persist the canonical gameplay event before returning.
    const eventType = result.requires_approval ? 'catch_pending' : 'catch_performed';
    const ingestResult = await ingestGameplayEvent(supabaseAdmin, {
      type: eventType,
      userId,
      conventionId: resolvedConventionId,
      payload: {
        catch_id: result.catch_id,
        fursuit_id: body.fursuit_id,
        catcher_id: userId,
        fursuit_owner_id: result.fursuit_owner_id,
        convention_id: resolvedConventionId,
        is_tutorial: body.is_tutorial ?? false,
        status: result.status,
        species: speciesName,
        colors: colorNames,
        maker_names: makerMetadata.makerNames,
        normalized_maker_names: makerMetadata.normalizedMakerNames,
        has_maker: makerMetadata.normalizedMakerNames.length > 0,
        is_self_made: makerMetadata.hasSelfMadeMaker,
        has_catcher_owned_maker_match: hasMakerMatchWithCatcherOwnedSuit,
        is_new_maker_for_catcher_at_convention: isNewMakerForCatcherAtConvention,
      },
      occurredAt: new Date().toISOString(),
      idempotencyKey: `catch:${result.catch_id}:${eventType}`,
    });

    const queueConfig = await loadGameplayQueueConfig(supabaseAdmin);
    let inlineAwards: unknown[] = [];
    let processedInline = false;

    if (
      !ingestResult.duplicate &&
      queueConfig.inlineProcessingEnabled &&
      eventType === 'catch_performed'
    ) {
      try {
        const inlineResult = await processEventInline(ingestResult.eventId);
        processedInline = inlineResult.processed;
        inlineAwards = inlineResult.awards;
      } catch (inlineError) {
        console.error(
          '[create-catch] Inline gameplay processing failed; falling back to queue wakeup',
          {
            eventId: ingestResult.eventId,
            error: inlineError,
          },
        );
      }
    }

    if (ingestResult.enqueued && !ingestResult.duplicate && !processedInline) {
      if (queueConfig.queueEnabled && queueConfig.wakeupEnabled) {
        scheduleGameplayQueueDrain({
          supabaseUrl: resolvedSupabaseUrl,
          serviceRoleKey: resolvedServiceRoleKey,
          maxMessages: queueConfig.wakeupMaxMessages,
          maxDurationMs: queueConfig.wakeupMaxDurationMs,
        });
      }
    }

    return jsonResponse(201, {
      ...result,
      event_id: ingestResult.eventId,
      awards: inlineAwards,
      species: speciesName,
      colors: colorNames,
    });
  } catch (error) {
    console.error('[create-catch] Unexpected error:', error);
    return jsonResponse(500, { error: 'Internal server error' });
  }
}

async function handlePatch(req: Request): Promise<Response> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  let body: UpdateCatchPhotoRequest;
  try {
    body = (await req.json()) as UpdateCatchPhotoRequest;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload' });
  }

  if (!body.catch_id || !body.catch_photo_url) {
    return jsonResponse(400, { error: 'Missing catch_id or catch_photo_url' });
  }

  // Verify the catch belongs to this user
  const { data: catchRow, error: fetchError } = await supabaseAdmin
    .from('catches')
    .select('id, catcher_id')
    .eq('id', body.catch_id)
    .single();

  if (fetchError || !catchRow) {
    return jsonResponse(404, { error: 'Catch not found' });
  }

  if ((catchRow as { catcher_id: string }).catcher_id !== userId) {
    return jsonResponse(403, { error: 'Forbidden' });
  }

  const { error: updateError } = await supabaseAdmin
    .from('catches')
    .update({
      catch_photo_path: body.catch_photo_path ?? null,
      catch_photo_url: body.catch_photo_url,
    })
    .eq('id', body.catch_id);

  if (updateError) {
    console.error('[create-catch] Failed to update catch photo:', updateError);
    return jsonResponse(500, { error: 'Failed to update catch photo' });
  }

  // Now that the photo URL is attached, notify the fursuit owner.
  // We do this here (not in POST) so the owner sees the photo immediately on their card.
  try {
    const { data: catchCtx, error: catchCtxError } = await supabaseAdmin
      .from('catches')
      .select(
        'catcher_id, fursuit_id, fursuits!catches_fursuit_id_fkey(owner_id, name), profiles!catches_catcher_id_fkey(username)',
      )
      .eq('id', body.catch_id)
      .single();

    if (catchCtxError) {
      throw catchCtxError;
    }

    if (catchCtx) {
      const fursuit = Array.isArray(catchCtx.fursuits) ? catchCtx.fursuits[0] : catchCtx.fursuits;
      const profile = Array.isArray(catchCtx.profiles) ? catchCtx.profiles[0] : catchCtx.profiles;

      const { error: notifError } = await supabaseAdmin.rpc('notify_catch_pending', {
        p_catch_id: body.catch_id,
        p_fursuit_owner_id: (fursuit as { owner_id: string } | null)?.owner_id,
        p_catcher_id: catchCtx.catcher_id,
        p_fursuit_name: (fursuit as { name: string } | null)?.name ?? 'Unknown Fursuit',
        p_catcher_username: (profile as { username: string } | null)?.username ?? 'Someone',
      });

      if (notifError) {
        console.error('[create-catch] Failed to send photo catch notification:', notifError);
      }
    }
  } catch (notifError) {
    console.error('[create-catch] Error sending photo catch notification:', notifError);
    // Don't fail the response — the photo was attached successfully
  }

  return jsonResponse(200, { success: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'POST') {
    return handlePost(req);
  }

  if (req.method === 'PATCH') {
    return handlePatch(req);
  }

  return jsonResponse(405, { error: 'Method not allowed' });
});
