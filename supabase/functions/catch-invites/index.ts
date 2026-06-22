/// <reference lib="deno.unstable" />
// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions import via remote URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { loadGameplayQueueConfig, scheduleGameplayQueueDrain } from '../_shared/gameplayQueue.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('ANON_KEY');
const serviceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const inviteBaseUrl =
  Deno.env.get('TAILTAG_INVITE_BASE_URL') ?? 'https://www.playtailtag.com/invite';

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error('Missing Supabase configuration');
}

const resolvedSupabaseUrl = supabaseUrl;
const resolvedSupabaseAnonKey = supabaseAnonKey;
const resolvedServiceRoleKey = serviceRoleKey;
const catchInvitesFeatureKey = 'catch_invites';

const supabaseAdmin = createClient(resolvedSupabaseUrl, resolvedServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type Action = 'create' | 'claim' | 'approve' | 'decline' | 'report';

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAction(value: unknown): Action | null {
  return value === 'create' ||
    value === 'claim' ||
    value === 'approve' ||
    value === 'decline' ||
    value === 'report'
    ? value
    : null;
}

function normalizeUuidLike(value: unknown): string | null {
  const trimmed = readString(value);
  if (!trimmed) {
    return null;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function normalizePhotoSource(value: unknown): 'camera' | 'gallery' | null {
  return value === 'camera' || value === 'gallery' ? value : null;
}

function normalizeToken(value: unknown): string | null {
  const trimmed = readString(value);
  if (!trimmed) {
    return null;
  }

  return /^[A-Za-z0-9_-]{32,160}$/.test(trimmed) ? trimmed : null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function buildShareUrl(token: string): string {
  return `${inviteBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(token)}`;
}

function scheduleQueueWakeup() {
  void loadGameplayQueueConfig(supabaseAdmin)
    .then((config) => {
      if (!config.queueEnabled || !config.wakeupEnabled) {
        return;
      }

      scheduleGameplayQueueDrain({
        supabaseUrl: resolvedSupabaseUrl,
        serviceRoleKey: resolvedServiceRoleKey,
        maxMessages: config.wakeupMaxMessages,
        maxDurationMs: config.wakeupMaxDurationMs,
      });
    })
    .catch((error) => {
      console.error('[catch-invites] Queue wakeup failed:', error);
    });
}

async function isCatchInvitesEnabledForProfile(profileId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('is_feature_enabled_for_profile', {
    p_feature_key: catchInvitesFeatureKey,
    p_profile_id: profileId,
  });

  if (error) {
    console.error('[catch-invites] Feature flag check failed:', error);
    return false;
  }

  return data === true;
}

function errorResponse(error: { message?: string } | null | undefined) {
  const message =
    typeof error?.message === 'string' && error.message.trim().length > 0
      ? error.message
      : "We couldn't process that invite.";

  if (message.includes('not found')) {
    return jsonResponse(404, { error: message });
  }

  if (
    message.includes('limit') ||
    message.includes('expired') ||
    message.includes('already') ||
    message.includes('claim') ||
    message.includes('Suspended') ||
    message.includes('review') ||
    message.includes('blocked') ||
    message.includes('cannot')
  ) {
    return jsonResponse(400, { error: message });
  }

  return jsonResponse(500, { error: "We couldn't process that invite." });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const userClient = createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload' });
  }

  const action = normalizeAction(body.action);
  if (!action) {
    return jsonResponse(400, { error: 'Missing invite action' });
  }

  if (action === 'create') {
    const catchInvitesEnabled = await isCatchInvitesEnabledForProfile(user.id);
    if (!catchInvitesEnabled) {
      return jsonResponse(400, { error: 'Invite catches are not available yet.' });
    }

    const photoPath = readString(body.catch_photo_path);
    const photoUrl = readString(body.catch_photo_url);
    const photoSource = normalizePhotoSource(body.catch_photo_source) ?? 'camera';
    const conventionId = normalizeUuidLike(body.convention_id);
    const inviteeDisplayName = readString(body.invitee_display_name);
    const caughtAt = readString(body.caught_at);

    if (!photoPath || !photoUrl) {
      return jsonResponse(400, { error: 'Invite photo is required' });
    }

    if (body.convention_id && !conventionId) {
      return jsonResponse(400, { error: 'Invalid convention' });
    }

    const token = generateInviteToken();
    const tokenHash = await sha256Hex(token);

    const { data, error } = await supabaseAdmin.rpc('create_catch_invite', {
      p_inviter_profile_id: user.id,
      p_token_hash: tokenHash,
      p_catch_photo_path: photoPath,
      p_catch_photo_url: photoUrl,
      p_catch_photo_source: photoSource,
      p_convention_id: conventionId,
      p_invitee_display_name: inviteeDisplayName,
      p_caught_at: caughtAt,
    });

    if (error) {
      console.error('[catch-invites] create RPC error:', error);
      return errorResponse(error);
    }

    return jsonResponse(201, {
      invite: data,
      token,
      share_url: buildShareUrl(token),
    });
  }

  if (action === 'claim') {
    const token = normalizeToken(body.token);
    if (!token) {
      return jsonResponse(400, { error: 'Missing invite token' });
    }

    const tokenHash = await sha256Hex(token);
    const { data, error } = await supabaseAdmin.rpc('claim_catch_invite', {
      p_token_hash: tokenHash,
      p_claimant_profile_id: user.id,
    });

    if (error) {
      console.error('[catch-invites] claim RPC error:', error);
      return errorResponse(error);
    }

    return jsonResponse(200, { invite: data });
  }

  const inviteId = normalizeUuidLike(body.invite_id);
  if (!inviteId) {
    return jsonResponse(400, { error: 'Missing invite id' });
  }

  if (action === 'approve') {
    const fursuitId = normalizeUuidLike(body.fursuit_id);
    if (!fursuitId) {
      return jsonResponse(400, { error: 'Choose a fursuit before approving.' });
    }

    const { data, error } = await supabaseAdmin.rpc('approve_catch_invite', {
      p_invite_id: inviteId,
      p_claimant_profile_id: user.id,
      p_fursuit_id: fursuitId,
    });

    if (error) {
      console.error('[catch-invites] approve RPC error:', error);
      return errorResponse(error);
    }

    if (
      data &&
      typeof data === 'object' &&
      'event_enqueued' in data &&
      data.event_enqueued === true
    ) {
      scheduleQueueWakeup();
    }

    return jsonResponse(200, { invite: data });
  }

  if (action === 'decline') {
    const { data, error } = await supabaseAdmin.rpc('decline_catch_invite', {
      p_invite_id: inviteId,
      p_claimant_profile_id: user.id,
    });

    if (error) {
      console.error('[catch-invites] decline RPC error:', error);
      return errorResponse(error);
    }

    return jsonResponse(200, { invite: data });
  }

  const reason = readString(body.reason);
  const { data, error } = await supabaseAdmin.rpc('report_catch_invite', {
    p_invite_id: inviteId,
    p_claimant_profile_id: user.id,
    p_reason: reason,
  });

  if (error) {
    console.error('[catch-invites] report RPC error:', error);
    return errorResponse(error);
  }

  return jsonResponse(200, { invite: data });
});
