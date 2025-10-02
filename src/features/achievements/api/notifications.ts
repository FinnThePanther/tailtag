import { supabase } from '../../../lib/supabase';
import type { AchievementNotificationsRow } from '../../../types/database';

export type AchievementNotification = AchievementNotificationsRow;

export async function fetchPendingNotifications(
  userId: string,
): Promise<AchievementNotification[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('achievement_notifications')
    .select('*')
    .eq('user_id', userId)
    .is('acknowledged_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Unable to load achievement notifications: ${error.message}`);
  }

  return (data ?? []) as AchievementNotification[];
}

export async function acknowledgeNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const client = supabase as any;
  const { error } = await client
    .from('achievement_notifications')
    .update({ acknowledged_at: new Date().toISOString() })
    .in('id', ids);

  if (error) {
    throw new Error(`Unable to acknowledge notifications: ${error.message}`);
  }
}
