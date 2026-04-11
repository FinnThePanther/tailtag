'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';

type Scope = 'global' | 'event';

const BAN_ROLES = ['owner', 'organizer', 'moderator'] as const;
const MUTE_ROLES = ['owner', 'organizer', 'moderator'] as const;

export async function banUserAction(input: {
  userId: string;
  reason: string;
  durationHours?: number | null;
  scope?: Scope;
  conventionId?: string | null;
}) {
  const { profile } = await assertAdminAction([...BAN_ROLES]);
  const supabase = createServiceRoleClient();
  const scope = input.scope ?? 'global';
  const expiresAt =
    input.durationHours && input.durationHours > 0
      ? new Date(Date.now() + input.durationHours * 60 * 60 * 1000).toISOString()
      : null;

  await supabase.from('user_moderation_actions').insert({
    user_id: input.userId,
    action_type: 'ban',
    scope,
    convention_id: scope === 'event' ? (input.conventionId ?? null) : null,
    reason: input.reason,
    duration_hours: input.durationHours ?? null,
    expires_at: expiresAt,
    is_active: true,
    applied_by_user_id: profile.id,
  });

  await supabase
    .from('profiles')
    .update({
      is_suspended: true,
      suspended_until: expiresAt,
      suspension_reason: input.reason || 'Banned',
    })
    .eq('id', input.userId);

  await logAudit({
    actorId: profile.id,
    action: 'ban_user',
    entityType: 'profile',
    entityId: input.userId,
    context: {
      reason: input.reason,
      scope,
      convention_id: input.conventionId ?? null,
      duration_hours: input.durationHours ?? null,
    },
  });

  revalidatePath('/players');
  revalidatePath(`/players/${input.userId}`);
}

export async function unbanUserAction(input: { userId: string; reason?: string | null }) {
  const { profile } = await assertAdminAction([...BAN_ROLES]);
  const supabase = createServiceRoleClient();

  await supabase
    .from('user_moderation_actions')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: profile.id,
      revoke_reason: input.reason ?? 'Unbanned via admin',
    })
    .eq('user_id', input.userId)
    .eq('action_type', 'ban')
    .eq('is_active', true);

  await supabase
    .from('profiles')
    .update({
      is_suspended: false,
      suspended_until: null,
      suspension_reason: null,
    })
    .eq('id', input.userId);

  await logAudit({
    actorId: profile.id,
    action: 'unban_user',
    entityType: 'profile',
    entityId: input.userId,
    context: { reason: input.reason ?? null },
  });

  revalidatePath('/players');
  revalidatePath(`/players/${input.userId}`);
}

export async function muteUserAction(input: {
  userId: string;
  reason: string;
  durationHours?: number | null;
  scope?: Scope;
  conventionId?: string | null;
}) {
  const { profile } = await assertAdminAction([...MUTE_ROLES]);
  const supabase = createServiceRoleClient();
  const scope = input.scope ?? 'global';
  const expiresAt =
    input.durationHours && input.durationHours > 0
      ? new Date(Date.now() + input.durationHours * 60 * 60 * 1000).toISOString()
      : null;

  await supabase.from('user_moderation_actions').insert({
    user_id: input.userId,
    action_type: 'mute',
    scope,
    convention_id: scope === 'event' ? (input.conventionId ?? null) : null,
    reason: input.reason,
    duration_hours: input.durationHours ?? null,
    expires_at: expiresAt,
    is_active: true,
    applied_by_user_id: profile.id,
  });

  await logAudit({
    actorId: profile.id,
    action: 'mute_user',
    entityType: 'profile',
    entityId: input.userId,
    context: {
      reason: input.reason,
      scope,
      convention_id: input.conventionId ?? null,
      duration_hours: input.durationHours ?? null,
    },
  });

  revalidatePath('/players');
  revalidatePath(`/players/${input.userId}`);
}

export async function unmuteUserAction(input: { userId: string; reason?: string | null }) {
  const { profile } = await assertAdminAction([...MUTE_ROLES]);
  const supabase = createServiceRoleClient();

  await supabase
    .from('user_moderation_actions')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: profile.id,
      revoke_reason: input.reason ?? 'Unmuted via admin',
    })
    .eq('user_id', input.userId)
    .eq('action_type', 'mute')
    .eq('is_active', true);

  await logAudit({
    actorId: profile.id,
    action: 'unmute_user',
    entityType: 'profile',
    entityId: input.userId,
    context: { reason: input.reason ?? null },
  });

  revalidatePath('/players');
  revalidatePath(`/players/${input.userId}`);
}
