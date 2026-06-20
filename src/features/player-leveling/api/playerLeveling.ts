import type { QueryClient } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database';

export const PLAYER_LEVEL_SUMMARY_QUERY_KEY = 'player-level-summary';
export const OWN_PLAYER_PROGRESS_QUERY_KEY = 'own-player-progress';

export const playerLevelSummaryQueryKey = (userId: string) =>
  [PLAYER_LEVEL_SUMMARY_QUERY_KEY, userId] as const;

export const ownPlayerProgressQueryKey = (userId: string) =>
  [OWN_PLAYER_PROGRESS_QUERY_KEY, userId] as const;

type PlayerProgressRow = Database['public']['Tables']['player_progress']['Row'];
type PlayerLevelSummaryRow =
  Database['public']['Functions']['get_player_level_summary']['Returns'][number];

export type PlayerLevelSummary = {
  userId: string;
  level: number;
};

export type OwnPlayerProgress = {
  userId: string;
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  levelProgress: number;
  lastLevelUpAt: string | null;
  updatedAt: string | null;
};

export function xpRequiredForLevel(level: number): number {
  const safeLevel = Math.max(Math.trunc(level), 1);
  return 100 * (safeLevel - 1) ** 2;
}

export function levelForXp(totalXp: number): number {
  const safeTotalXp = Math.max(Math.trunc(totalXp), 0);
  return Math.floor(Math.sqrt(safeTotalXp / 100)) + 1;
}

export function createLevelProgress(input: {
  userId: string;
  totalXp?: number | null;
  level?: number | null;
  lastLevelUpAt?: string | null;
  updatedAt?: string | null;
}): OwnPlayerProgress {
  const totalXp = Math.max(Math.trunc(input.totalXp ?? 0), 0);
  const level = Math.max(Math.trunc(input.level ?? levelForXp(totalXp)), 1);
  const currentLevelXp = xpRequiredForLevel(level);
  const nextLevelXp = xpRequiredForLevel(level + 1);
  const levelXpSpan = Math.max(nextLevelXp - currentLevelXp, 1);
  const xpIntoLevel = Math.max(totalXp - currentLevelXp, 0);
  const xpToNextLevel = Math.max(nextLevelXp - totalXp, 0);
  const levelProgress = Math.min(Math.max(xpIntoLevel / levelXpSpan, 0), 1);

  return {
    userId: input.userId,
    totalXp,
    level,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel,
    xpToNextLevel,
    levelProgress,
    lastLevelUpAt: input.lastLevelUpAt ?? null,
    updatedAt: input.updatedAt ?? null,
  };
}

function mapSummaryRow(row: PlayerLevelSummaryRow | null | undefined): PlayerLevelSummary | null {
  if (!row?.user_id) {
    return null;
  }

  return {
    userId: row.user_id,
    level: Math.max(Math.trunc(row.level ?? 1), 1),
  };
}

function mapProgressRow(userId: string, row: PlayerProgressRow | null): OwnPlayerProgress {
  if (!row) {
    return createLevelProgress({ userId });
  }

  return createLevelProgress({
    userId: row.user_id,
    totalXp: row.total_xp,
    level: row.level,
    lastLevelUpAt: row.last_level_up_at,
    updatedAt: row.updated_at,
  });
}

export async function fetchPlayerLevelSummary(userId: string): Promise<PlayerLevelSummary | null> {
  const { data, error } = await supabase.rpc('get_player_level_summary', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Could not load player level: ${error.message}`);
  }

  return mapSummaryRow((data ?? [])[0] ?? null);
}

export async function fetchOwnPlayerProgress(userId: string): Promise<OwnPlayerProgress> {
  const client = supabase as any;
  const { data, error } = await client
    .from('player_progress')
    .select('user_id,total_xp,level,last_level_up_at,updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load your player level: ${error.message}`);
  }

  return mapProgressRow(userId, (data ?? null) as PlayerProgressRow | null);
}

export const createPlayerLevelSummaryQueryOptions = (userId: string) => ({
  queryKey: playerLevelSummaryQueryKey(userId),
  queryFn: () => fetchPlayerLevelSummary(userId),
  staleTime: 2 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
});

export const createOwnPlayerProgressQueryOptions = (userId: string) => ({
  queryKey: ownPlayerProgressQueryKey(userId),
  queryFn: () => fetchOwnPlayerProgress(userId),
  staleTime: 60_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
});

export function invalidatePlayerLevelingQueries(queryClient: QueryClient, userId: string) {
  void queryClient.invalidateQueries({ queryKey: playerLevelSummaryQueryKey(userId) });
  void queryClient.invalidateQueries({ queryKey: ownPlayerProgressQueryKey(userId) });
}
