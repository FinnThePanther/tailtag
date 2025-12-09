'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';

const SIM_ROLES = ['owner', 'organizer'] as const;

export async function simulateCatchAction(input: {
  conventionId: string;
  catcherId: string;
  fursuitId: string;
}) {
  const { profile } = await assertAdminAction([...SIM_ROLES]);
  const supabase = createServiceRoleClient();

  if (!input.conventionId || !input.catcherId || !input.fursuitId) {
    throw new Error('All fields are required.');
  }

  await supabase.from('catches').insert({
    catcher_id: input.catcherId,
    fursuit_id: input.fursuitId,
    convention_id: input.conventionId,
    status: 'ACCEPTED',
    caught_at: new Date().toISOString(),
    is_tutorial: false,
  });

  await logAudit({
    actorId: profile.id,
    action: 'simulate_catch',
    entityType: 'catches',
    entityId: null,
    context: {
      convention_id: input.conventionId,
      catcher_id: input.catcherId,
      fursuit_id: input.fursuitId,
    },
  });

  revalidatePath('/analytics');
}
