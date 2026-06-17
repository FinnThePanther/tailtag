'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';

const DEAD_LETTER_REPLAY_ROLES = ['owner', 'organizer'] as const;

export async function replayGameplayDeadLettersAction(formData: FormData) {
  const { profile } = await assertAdminAction([...DEAD_LETTER_REPLAY_ROLES]);
  const supabase = createServiceRoleClient();
  const eventIds = formData
    .getAll('event_id')
    .map((value) => String(value).trim())
    .filter(Boolean);
  const reason = String(formData.get('reason') ?? '').trim();

  if (eventIds.length === 0) {
    throw new Error('Select at least one dead-lettered event to replay.');
  }

  if (!reason) {
    throw new Error('Replay reason is required.');
  }

  const { error } = await supabase.rpc('replay_gameplay_dead_letter_events', {
    p_actor_id: profile.id,
    p_event_ids: [...new Set(eventIds)],
    p_reason: reason,
  });

  if (error) {
    throw error;
  }

  revalidatePath('/errors');
  revalidatePath('/audit');
}
