import type { Cookies } from '@sveltejs/kit';
import { assertAdminAction } from '$lib/server/auth';
import { createServiceRoleClient } from '$lib/server/supabase/service';
import { logAudit } from '$lib/server/audit';

const ACHIEVEMENT_ROLES = ['owner', 'organizer'] as const;

export async function grantAchievementAction(
  cookies: Cookies,
  input: { userId: string; achievementId: string },
) {
  const { profile } = await assertAdminAction(cookies, [...ACHIEVEMENT_ROLES]);
  const supabase = createServiceRoleClient();

  if (!input.userId || !input.achievementId) {
    throw new Error('User ID and achievement are required.');
  }

  await supabase.from('user_achievements').insert({
    user_id: input.userId,
    achievement_id: input.achievementId,
    context: {},
  });

  await logAudit({
    actorId: profile.id,
    action: 'grant_achievement',
    entityType: 'user_achievements',
    entityId: null,
    context: { user_id: input.userId, achievement_id: input.achievementId },
  });
}

export async function revokeAchievementAction(
  cookies: Cookies,
  input: { userId: string; achievementId: string },
) {
  const { profile } = await assertAdminAction(cookies, [...ACHIEVEMENT_ROLES]);
  const supabase = createServiceRoleClient();

  if (!input.userId || !input.achievementId) {
    throw new Error('User ID and achievement are required.');
  }

  await supabase
    .from('user_achievements')
    .delete()
    .eq('user_id', input.userId)
    .eq('achievement_id', input.achievementId);

  await logAudit({
    actorId: profile.id,
    action: 'revoke_achievement',
    entityType: 'user_achievements',
    entityId: null,
    context: { user_id: input.userId, achievement_id: input.achievementId },
  });
}
