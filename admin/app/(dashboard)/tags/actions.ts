'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';

const TAG_ROLES = ['owner', 'organizer', 'staff'] as const;

const normalizeUid = (uid: string) => uid.trim().toUpperCase().replace(/[:\s-]/g, '');

async function ensureTag(uid: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from('nfc_tags').select('uid, status').eq('uid', uid).maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

export async function registerTagAction(input: { uid: string }) {
  const { profile } = await assertAdminAction([...TAG_ROLES]);
  const supabase = createServiceRoleClient();
  const normalizedUid = normalizeUid(input.uid);

  if (!normalizedUid) {
    throw new Error('Tag UID is required.');
  }

  const now = new Date().toISOString();
  await supabase.from('nfc_tags').upsert(
    {
      uid: normalizedUid,
      status: 'pending_link',
      registered_by_user_id: profile.id,
      registered_at: now,
      updated_at: now,
      linked_at: null,
      fursuit_id: null,
    },
    { onConflict: 'uid' }
  );

  await logAudit({
    actorId: profile.id,
    action: 'register_tag',
    entityType: 'nfc_tag',
    entityId: null,
    context: { uid: normalizedUid },
  });

  revalidatePath('/tags');
}

export async function linkTagAction(input: { uid: string; fursuitId: string }) {
  const { profile } = await assertAdminAction([...TAG_ROLES]);
  const supabase = createServiceRoleClient();
  const normalizedUid = normalizeUid(input.uid);

  if (!normalizedUid || !input.fursuitId) {
    throw new Error('Tag UID and fursuit ID are required.');
  }

  await ensureTag(normalizedUid);

  const now = new Date().toISOString();
  await supabase
    .from('nfc_tags')
    .update({
      fursuit_id: input.fursuitId,
      status: 'active',
      linked_at: now,
      updated_at: now,
    })
    .eq('uid', normalizedUid);

  await logAudit({
    actorId: profile.id,
    action: 'link_tag',
    entityType: 'nfc_tag',
    entityId: null,
    context: { uid: normalizedUid, fursuit_id: input.fursuitId },
  });

  revalidatePath('/tags');
}

export async function unlinkTagAction(input: { uid: string }) {
  const { profile } = await assertAdminAction([...TAG_ROLES]);
  const supabase = createServiceRoleClient();
  const normalizedUid = normalizeUid(input.uid);

  if (!normalizedUid) {
    throw new Error('Tag UID is required.');
  }

  await ensureTag(normalizedUid);

  await supabase
    .from('nfc_tags')
    .update({
      fursuit_id: null,
      status: 'revoked',
      updated_at: new Date().toISOString(),
    })
    .eq('uid', normalizedUid);

  await logAudit({
    actorId: profile.id,
    action: 'unlink_tag',
    entityType: 'nfc_tag',
    entityId: null,
    context: { uid: normalizedUid },
  });

  revalidatePath('/tags');
}

export async function markTagLostAction(input: { uid: string }) {
  const { profile } = await assertAdminAction([...TAG_ROLES]);
  const supabase = createServiceRoleClient();
  const normalizedUid = normalizeUid(input.uid);

  if (!normalizedUid) {
    throw new Error('Tag UID is required.');
  }

  await ensureTag(normalizedUid);

  await supabase
    .from('nfc_tags')
    .update({
      status: 'lost',
      updated_at: new Date().toISOString(),
    })
    .eq('uid', normalizedUid);

  await logAudit({
    actorId: profile.id,
    action: 'mark_tag_lost',
    entityType: 'nfc_tag',
    entityId: null,
    context: { uid: normalizedUid },
  });

  revalidatePath('/tags');
}

export async function markTagFoundAction(input: { uid: string }) {
  const { profile } = await assertAdminAction([...TAG_ROLES]);
  const supabase = createServiceRoleClient();
  const normalizedUid = normalizeUid(input.uid);

  if (!normalizedUid) {
    throw new Error('Tag UID is required.');
  }

  await ensureTag(normalizedUid);

  await supabase
    .from('nfc_tags')
    .update({
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('uid', normalizedUid);

  await logAudit({
    actorId: profile.id,
    action: 'mark_tag_found',
    entityType: 'nfc_tag',
    entityId: null,
    context: { uid: normalizedUid },
  });

  revalidatePath('/tags');
}
