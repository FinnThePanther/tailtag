'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';

const FURSUIT_ROLES = ['owner', 'organizer', 'moderator'] as const;

export async function reviewFursuitAction(input: {
  queueId: string;
  status: 'approved' | 'rejected' | 'flagged';
  notes?: string | null;
  actionTaken?: 'approved' | 'edited' | 'removed' | 'warned_owner' | null;
}) {
  const { profile } = await assertAdminAction([...FURSUIT_ROLES]);
  const supabase = createServiceRoleClient();

  await supabase
    .from('fursuit_moderation_queue')
    .update({
      status: input.status,
      moderator_notes: input.notes ?? null,
      action_taken: input.actionTaken ?? null,
      reviewed_by_user_id: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', input.queueId);

  await logAudit({
    actorId: profile.id,
    action: 'review_fursuit',
    entityType: 'fursuit_moderation_queue',
    entityId: input.queueId,
    context: {
      status: input.status,
      notes: input.notes ?? null,
      action_taken: input.actionTaken ?? null,
    },
  });

  revalidatePath('/fursuits');
}
