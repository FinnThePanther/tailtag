import { supabase } from '../../../lib/supabase';
import type {
  AchievementCategory,
  AchievementEventsRow,
  AchievementRecipientRole,
  AchievementTriggerEvent,
  AchievementsRow,
  Json,
  UserAchievementsRow,
} from '../../../types/database';

export type AchievementRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  recipientRole: AchievementRecipientRole;
  triggerEvent: AchievementTriggerEvent;
  isActive: boolean;
};

export type AchievementWithStatus = AchievementRecord & {
  unlocked: boolean;
  unlockedAt: string | null;
  context: Json | null;
};

export const ACHIEVEMENTS_QUERY_KEY = 'achievements-catalog';
export const USER_ACHIEVEMENTS_QUERY_KEY = 'user-achievements';
export const ACHIEVEMENTS_STATUS_QUERY_KEY = 'achievements-status';

export const achievementsStatusQueryKey = (userId: string) =>
  [ACHIEVEMENTS_STATUS_QUERY_KEY, userId] as const;

export async function fetchAchievementCatalog(): Promise<AchievementRecord[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('achievements')
    .select('id, key, name, description, category, recipient_role, trigger_event, is_active')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`We couldn't load achievements: ${error.message}`);
  }

  return (data ?? []).map((row: AchievementsRow) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    category: row.category,
    recipientRole: row.recipient_role,
    triggerEvent: row.trigger_event,
    isActive: row.is_active,
  }));
}

export async function fetchUserAchievements(userId: string): Promise<UserAchievementsRow[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('user_achievements')
    .select('id, user_id, achievement_id, unlocked_at, context')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });

  if (error) {
    throw new Error(`We couldn't load your achievements: ${error.message}`);
  }

  return (data ?? []) as UserAchievementsRow[];
}

export async function fetchAchievementStatus(userId: string): Promise<AchievementWithStatus[]> {
  const [achievements, userAchievements] = await Promise.all([
    fetchAchievementCatalog(),
    fetchUserAchievements(userId),
  ]);

  const unlockedMap = new Map<string, UserAchievementsRow>();
  for (const entry of userAchievements) {
    unlockedMap.set(entry.achievement_id, entry);
  }

  return achievements
    .filter((achievement) => achievement.isActive)
    .map((achievement) => {
      const unlocked = unlockedMap.get(achievement.id) ?? null;
      return {
        ...achievement,
        unlocked: Boolean(unlocked),
        unlockedAt: unlocked?.unlocked_at ?? null,
        context: unlocked?.context ?? null,
      } satisfies AchievementWithStatus;
    });
}

export type AchievementEventRecord = AchievementEventsRow;
