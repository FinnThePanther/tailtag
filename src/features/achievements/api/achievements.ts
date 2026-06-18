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
  conventionId: string | null;
  conventionName: string | null;
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

function normalizeAchievementIdentity(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function readContextSourceAchievementKey(context: Json | null): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return null;
  }

  const value = (context as Record<string, unknown>).source_achievement_key;
  return typeof value === 'string' ? value : null;
}

function getAchievementDedupeKey(
  achievement: Pick<AchievementWithStatus, 'id' | 'key' | 'context'>,
): string {
  const sourceKey = readContextSourceAchievementKey(achievement.context);
  return (
    normalizeAchievementIdentity(sourceKey) ??
    normalizeAchievementIdentity(achievement.key) ??
    achievement.id
  );
}

function compareUnlockedAtAscending(
  a: Pick<AchievementWithStatus, 'unlockedAt'>,
  b: Pick<AchievementWithStatus, 'unlockedAt'>,
) {
  const aTime = a.unlockedAt ? new Date(a.unlockedAt).getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.unlockedAt ? new Date(b.unlockedAt).getTime() : Number.POSITIVE_INFINITY;

  if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
    return 0;
  }

  if (Number.isNaN(aTime)) {
    return 1;
  }

  if (Number.isNaN(bTime)) {
    return -1;
  }

  return aTime - bTime;
}

function dedupeUnlockedAchievements(
  achievements: AchievementWithStatus[],
): AchievementWithStatus[] {
  const byIdentity = new Map<string, AchievementWithStatus>();

  for (const achievement of achievements) {
    const key = getAchievementDedupeKey(achievement);
    const existing = byIdentity.get(key);

    if (!existing || compareUnlockedAtAscending(achievement, existing) < 0) {
      byIdentity.set(key, achievement);
    }
  }

  return [...byIdentity.values()].sort((a, b) => compareUnlockedAtAscending(b, a));
}

function dedupeAchievementStatuses(achievements: AchievementWithStatus[]): AchievementWithStatus[] {
  const byIdentity = new Map<string, AchievementWithStatus>();

  for (const achievement of achievements) {
    const key = getAchievementDedupeKey(achievement);
    const existing = byIdentity.get(key);

    if (!existing) {
      byIdentity.set(key, achievement);
      continue;
    }

    if (!existing.unlocked && achievement.unlocked) {
      byIdentity.set(key, achievement);
      continue;
    }

    if (
      existing.unlocked === achievement.unlocked &&
      compareUnlockedAtAscending(achievement, existing) < 0
    ) {
      byIdentity.set(key, achievement);
    }
  }

  return [...byIdentity.values()];
}

export async function fetchAchievementCatalog(): Promise<AchievementRecord[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('achievements')
    .select(
      'id, key, name, description, category, recipient_role, trigger_event, is_active, convention_id, convention:conventions(name)',
    )
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`We couldn't load achievements: ${error.message}`);
  }

  return (data ?? []).map((row: AchievementsRow & { convention: { name: string } | null }) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    category: row.category,
    recipientRole: row.recipient_role,
    triggerEvent: row.trigger_event,
    isActive: row.is_active,
    conventionId: (row as any).convention_id ?? null,
    conventionName: row.convention?.name ?? null,
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

  const visibleAchievements = achievements
    .filter((achievement) => achievement.conventionId === null || unlockedMap.has(achievement.id))
    .filter((achievement) => achievement.isActive || unlockedMap.has(achievement.id));

  return dedupeAchievementStatuses(
    visibleAchievements.map((achievement) => {
      const unlocked = unlockedMap.get(achievement.id) ?? null;
      return {
        ...achievement,
        unlocked: Boolean(unlocked),
        unlockedAt: unlocked?.unlocked_at ?? null,
        context: unlocked?.context ?? null,
      } satisfies AchievementWithStatus;
    }),
  );
}

export const USER_UNLOCKED_ACHIEVEMENTS_QUERY_KEY = 'user-unlocked-achievements';
export const userUnlockedAchievementsQueryKey = (userId: string) =>
  [USER_UNLOCKED_ACHIEVEMENTS_QUERY_KEY, userId] as const;

export async function fetchUserUnlockedAchievements(
  userId: string,
): Promise<AchievementWithStatus[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('user_achievements')
    .select(
      `
      unlocked_at,
      context,
      achievement:achievements!inner(
        id, key, name, description, category, recipient_role, trigger_event, is_active, convention_id,
        convention:conventions(name)
      )
    `,
    )
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });

  if (error) {
    throw new Error(`We couldn't load achievements: ${error.message}`);
  }

  return dedupeUnlockedAchievements(
    (data ?? [])
      .filter((row: any) => row.achievement)
      .map((row: any) => ({
        id: row.achievement.id,
        key: row.achievement.key,
        name: row.achievement.name,
        description: row.achievement.description,
        category: row.achievement.category,
        recipientRole: row.achievement.recipient_role,
        triggerEvent: row.achievement.trigger_event,
        isActive: row.achievement.is_active,
        conventionId: row.achievement.convention_id ?? null,
        conventionName: row.achievement.convention?.name ?? null,
        unlocked: true,
        unlockedAt: row.unlocked_at ?? null,
        context: row.context ?? null,
      })),
  );
}

export type AchievementEventRecord = AchievementEventsRow;
