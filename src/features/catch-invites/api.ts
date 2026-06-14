import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/runtimeConfig';
import { CATCH_PHOTO_BUCKET, FURSUIT_BUCKET } from '@/constants/storage';
import { resolveStorageMediaUrl } from '@/utils/supabase-image';
import type { CatchInvite, CatchInviteStatus, CreateCatchInviteResult } from './types';

const EDGE_FUNCTION_TIMEOUT_MS = 15 * 1000;

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeStatus(value: unknown): CatchInviteStatus {
  if (
    value === 'PENDING' ||
    value === 'CLAIMED' ||
    value === 'APPROVED' ||
    value === 'DECLINED' ||
    value === 'EXPIRED' ||
    value === 'REPORTED' ||
    value === 'CANCELED' ||
    value === 'CANCELED_DUPLICATE'
  ) {
    return value;
  }

  return 'PENDING';
}

function normalizeInvite(raw: unknown): CatchInvite {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const catchPhotoPath = stringField(value.catch_photo_path);
  const selectedFursuitAvatarPath = stringField(value.selected_fursuit_avatar_path);

  return {
    inviteId: stringField(value.invite_id) ?? '',
    status: normalizeStatus(value.status),
    inviterProfileId: stringField(value.inviter_profile_id) ?? '',
    claimedByProfileId: stringField(value.claimed_by_profile_id),
    selectedFursuitId: stringField(value.selected_fursuit_id),
    conventionId: stringField(value.convention_id),
    conventionName: stringField(value.convention_name),
    inviteeDisplayName: stringField(value.invitee_display_name),
    catchPhotoPath,
    catchPhotoUrl: resolveStorageMediaUrl({
      bucket: CATCH_PHOTO_BUCKET,
      path: catchPhotoPath,
      legacyUrl: stringField(value.catch_photo_url),
    }),
    catchPhotoSource: value.catch_photo_source === 'gallery' ? 'gallery' : 'camera',
    caughtAt: stringField(value.caught_at) ?? new Date().toISOString(),
    expiresAt: stringField(value.expires_at) ?? new Date().toISOString(),
    creditScope: value.credit_scope === 'personal_only' ? 'personal_only' : 'full',
    convertedCatchId: stringField(value.converted_catch_id),
    inviterUsername: stringField(value.inviter_username),
    selectedFursuitName: stringField(value.selected_fursuit_name),
    selectedFursuitAvatarPath,
    selectedFursuitAvatarUrl: resolveStorageMediaUrl({
      bucket: FURSUIT_BUCKET,
      path: selectedFursuitAvatarPath,
      legacyUrl: stringField(value.selected_fursuit_avatar_url),
    }),
    catchId: stringField(value.catch_id),
    catchNumber: numberField(value.catch_number),
    eventEnqueued: value.event_enqueued === true,
  };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = await response.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function callCatchInvitesFunction(body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    throw new Error('You must be signed in to use invite catches.');
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration not set.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/catch-invites`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform: Platform.OS,
        ...body,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseData = await readJsonResponse(response);
      throw new Error(
        typeof responseData?.error === 'string'
          ? responseData.error
          : "We couldn't process that invite.",
      );
    }

    const responseData = await readJsonResponse(response);
    if (!responseData) {
      throw new Error("We couldn't process that invite.");
    }

    return responseData as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request took too long. Please check your connection and try again.');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createCatchInvite(params: {
  catchPhotoPath: string;
  catchPhotoUrl: string;
  catchPhotoSource: 'camera' | 'gallery';
  conventionId: string | null;
  inviteeDisplayName?: string | null;
  caughtAt?: string | null;
}): Promise<CreateCatchInviteResult> {
  const response = await callCatchInvitesFunction({
    action: 'create',
    catch_photo_path: params.catchPhotoPath,
    catch_photo_url: params.catchPhotoUrl,
    catch_photo_source: params.catchPhotoSource,
    convention_id: params.conventionId,
    invitee_display_name: params.inviteeDisplayName ?? null,
    caught_at: params.caughtAt ?? null,
  });

  const token = stringField(response.token);
  const shareUrl = stringField(response.share_url);

  if (!token || !shareUrl) {
    throw new Error("We couldn't create a shareable invite link. Please try again.");
  }

  return {
    invite: normalizeInvite(response.invite),
    token,
    shareUrl,
  };
}

export async function claimCatchInvite(token: string): Promise<CatchInvite> {
  const response = await callCatchInvitesFunction({ action: 'claim', token });
  return normalizeInvite(response.invite);
}

export async function approveCatchInvite(params: {
  inviteId: string;
  fursuitId: string;
}): Promise<CatchInvite> {
  const response = await callCatchInvitesFunction({
    action: 'approve',
    invite_id: params.inviteId,
    fursuit_id: params.fursuitId,
  });
  return normalizeInvite(response.invite);
}

export async function declineCatchInvite(inviteId: string): Promise<CatchInvite> {
  const response = await callCatchInvitesFunction({ action: 'decline', invite_id: inviteId });
  return normalizeInvite(response.invite);
}

export async function reportCatchInvite(params: {
  inviteId: string;
  reason?: string | null;
}): Promise<CatchInvite> {
  const response = await callCatchInvitesFunction({
    action: 'report',
    invite_id: params.inviteId,
    reason: params.reason ?? null,
  });
  return normalizeInvite(response.invite);
}
