import type { Cookies } from '@sveltejs/kit';
import { assertAdminAction } from '$lib/server/auth';
import { createServiceRoleClient } from '$lib/server/supabase/service';
import { logAudit } from '$lib/server/audit';

const ASSIGN_ROLES = ['owner', 'organizer'] as const;

export async function addStaffAssignment(
  cookies: Cookies,
  input: {
    profileId: string;
    conventionId: string;
    role: 'staff' | 'organizer';
    status?: 'active' | 'inactive';
    notes?: string | null;
  },
) {
  const { profile } = await assertAdminAction(cookies, [...ASSIGN_ROLES]);
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from('event_staff').insert({
    profile_id: input.profileId,
    convention_id: input.conventionId,
    role: input.role,
    status: input.status ?? 'active',
    notes: input.notes ?? null,
    assigned_by_user_id: profile.id,
  });

  if (error) {
    throw error;
  }

  await logAudit({
    actorId: profile.id,
    action: 'assign_staff',
    entityType: 'event_staff',
    entityId: null,
    context: {
      profile_id: input.profileId,
      convention_id: input.conventionId,
      role: input.role,
      status: input.status ?? 'active',
    },
  });
}

export async function removeStaffAssignment(
  cookies: Cookies,
  input: { assignmentId: string; conventionId: string },
) {
  const { profile } = await assertAdminAction(cookies, [...ASSIGN_ROLES]);
  const supabase = createServiceRoleClient();

  await supabase.from('event_staff').delete().eq('id', input.assignmentId);

  await logAudit({
    actorId: profile.id,
    action: 'remove_staff',
    entityType: 'event_staff',
    entityId: input.assignmentId,
    context: { convention_id: input.conventionId },
  });
}
