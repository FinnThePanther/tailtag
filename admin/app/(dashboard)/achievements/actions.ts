'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';

const ACHIEVEMENT_ROLES = ['owner', 'organizer'] as const;

export async function grantAchievementAction(input: { userId: string; achievementId: string }) {
  const { profile } = await assertAdminAction([...ACHIEVEMENT_ROLES]);
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

  revalidatePath('/achievements');
}

export async function revokeAchievementAction(input: { userId: string; achievementId: string }) {
  const { profile } = await assertAdminAction([...ACHIEVEMENT_ROLES]);
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

  revalidatePath('/achievements');
}
