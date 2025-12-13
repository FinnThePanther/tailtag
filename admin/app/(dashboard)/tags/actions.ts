'use server';
'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';

const TAG_ROLES = ['owner', 'organizer', 'staff'] as const;
const QR_BUCKET = 'tag-qr-codes';

const normalizeUid = (uid: string) => uid.trim().toUpperCase().replace(/[:\s-]/g, '');

async function invokeTagFunction(body: Record<string, unknown>, accessToken: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.functions.invoke('register-tag', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to process tag request');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

export async function registerTagAction(input: { uid: string }) {
  const { session, profile } = await assertAdminAction([...TAG_ROLES]);
  const normalizedUid = normalizeUid(input.uid);

  if (!normalizedUid) {
    throw new Error('Tag UID is required.');
  }

  if (!session.access_token) {
    throw new Error('Unable to authenticate with Supabase.');
  }
  await invokeTagFunction({ action: 'register', nfc_uid: normalizedUid }, session.access_token);

  await logAudit({
    actorId: profile.id,
    action: 'register_tag',
    entityType: 'tag',
    entityId: null,
    context: { nfc_uid: normalizedUid },
  });

  revalidatePath('/tags');
}

export async function linkTagAction(input: { tagId: string; fursuitId: string }) {
  const { session, profile } = await assertAdminAction([...TAG_ROLES]);
  if (!input.tagId || !input.fursuitId) throw new Error('Tag and fursuit IDs are required.');

  if (!session.access_token) {
    throw new Error('Unable to authenticate with Supabase.');
  }
  await invokeTagFunction(
    {
      action: 'link',
      tag_id: input.tagId,
      fursuit_id: input.fursuitId,
    },
    session.access_token,
  );
    action: 'link',
    tag_id: input.tagId,
    fursuit_id: input.fursuitId,
  });

  await logAudit({
    actorId: profile.id,
    action: 'link_tag',
    entityType: 'tag',
    entityId: input.tagId,
    context: { tag_id: input.tagId, fursuit_id: input.fursuitId },
  });

  revalidatePath('/tags');
}

export async function unlinkTagAction(input: { tagId: string }) {
  const { session, profile } = await assertAdminAction([...TAG_ROLES]);
  if (!input.tagId) throw new Error('Tag ID is required.');

  if (!session.access_token) {
    throw new Error('Unable to authenticate with Supabase.');
  }
  await invokeTagFunction(
    {
      action: 'unlink',
      tag_id: input.tagId,
    },
    session.access_token,
  );
    action: 'unlink',
    tag_id: input.tagId,
  });

  await logAudit({
    actorId: profile.id,
    action: 'unlink_tag',
    entityType: 'tag',
    entityId: input.tagId,
    context: { tag_id: input.tagId },
  });

  revalidatePath('/tags');
}

export async function markTagLostAction(input: { tagId: string }) {
  const { session, profile } = await assertAdminAction([...TAG_ROLES]);
  if (!input.tagId) throw new Error('Tag ID is required.');

  if (!session.access_token) {
    throw new Error('Unable to authenticate with Supabase.');
  }
  await invokeTagFunction(
    {
      action: 'mark_lost',
      tag_id: input.tagId,
    },
    session.access_token,
  );
    action: 'mark_lost',
    tag_id: input.tagId,
  });

  await logAudit({
    actorId: profile.id,
    action: 'mark_tag_lost',
    entityType: 'tag',
    entityId: input.tagId,
    context: { tag_id: input.tagId },
  });

  revalidatePath('/tags');
}

export async function markTagFoundAction(input: { tagId: string }) {
  const { session, profile } = await assertAdminAction([...TAG_ROLES]);
  if (!input.tagId) throw new Error('Tag ID is required.');

  if (!session.access_token) {
    throw new Error('Unable to authenticate with Supabase.');
  }
  await invokeTagFunction(
    {
      action: 'mark_found',
      tag_id: input.tagId,
    },
    session.access_token,
  );
    action: 'mark_found',
    tag_id: input.tagId,
  });

  await logAudit({
    actorId: profile.id,
    action: 'mark_tag_found',
    entityType: 'tag',
    entityId: input.tagId,
    context: { tag_id: input.tagId },
  });

  revalidatePath('/tags');
}

export async function generateQrForTagAction(input: { tagId: string }) {
  const { session, profile } = await assertAdminAction([...TAG_ROLES]);
  if (!input.tagId) throw new Error('Tag ID is required.');

  if (!session.access_token) {
    throw new Error('Unable to authenticate with Supabase.');
  }
  await invokeTagFunction(
    {
      action: 'generate_qr',
      tag_id: input.tagId,
    },
    session.access_token,
  );
    action: 'generate_qr',
    tag_id: input.tagId,
  });

  await logAudit({
    actorId: profile.id,
    action: 'generate_qr',
    entityType: 'tag',
    entityId: input.tagId,
    context: { tag_id: input.tagId },
  });

  revalidatePath('/tags');
}

export async function rotateQrForTagAction(input: { tagId: string }) {
  const { session, profile } = await assertAdminAction([...TAG_ROLES]);
  if (!input.tagId) throw new Error('Tag ID is required.');

  if (!session.access_token) {
    throw new Error('Unable to authenticate with Supabase.');
  }
  await invokeTagFunction(
    {
      action: 'rotate_qr',
      tag_id: input.tagId,
    },
    session.access_token,
  );
    action: 'rotate_qr',
    tag_id: input.tagId,
  });

  await logAudit({
    actorId: profile.id,
    action: 'rotate_qr',
    entityType: 'tag',
    entityId: input.tagId,
    context: { tag_id: input.tagId },
  });

  revalidatePath('/tags');
}

export async function revokeQrForTagAction(input: { tagId: string }) {
  const { session, profile } = await assertAdminAction([...TAG_ROLES]);
  if (!input.tagId) throw new Error('Tag ID is required.');

  if (!session.access_token) {
    throw new Error('Unable to authenticate with Supabase.');
  }
  await invokeTagFunction(
    {
      action: 'revoke_qr',
      tag_id: input.tagId,
    },
    session.access_token,
  );
    action: 'revoke_qr',
    tag_id: input.tagId,
  });

  await logAudit({
    actorId: profile.id,
    action: 'revoke_qr',
    entityType: 'tag',
    entityId: input.tagId,
    context: { tag_id: input.tagId },
  });

  revalidatePath('/tags');
}

export async function createQrDownloadUrlAction(input: { assetPath: string }) {
  await assertAdminAction([...TAG_ROLES]);
  if (!input.assetPath) throw new Error('QR asset not available.');

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(QR_BUCKET)
    .createSignedUrl(input.assetPath, 60);

  if (error) {
    throw error;
  }

  return data?.signedUrl ?? null;
}
