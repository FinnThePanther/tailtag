import { supabase } from '../../../lib/supabase';
import type { MyPendingCatch } from '../types';
import { FURSUIT_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';

export const MY_PENDING_CATCHES_QUERY_KEY = 'my-pending-catches';

export const myPendingCatchesQueryKey = (userId: string) =>
  [MY_PENDING_CATCHES_QUERY_KEY, userId] as const;

export const MY_PENDING_CATCHES_STALE_TIME = 15 * 1000; // 15 seconds

/**
 * Fetch catches the current user made that are pending owner approval (catcher's view).
 */
export async function fetchMyPendingCatches(userId: string): Promise<MyPendingCatch[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('catches')
    .select(
      `
      id,
      caught_at,
      expires_at,
      convention_id,
      fursuit:fursuits (
        id,
        name,
        avatar_path,
        avatar_url
      ),
      convention:conventions (
        id,
        name
      )
    `,
    )
    .eq('catcher_id', userId)
    .eq('status', 'PENDING')
    .order('caught_at', { ascending: false });

  if (error) {
    throw new Error("We couldn't load your pending catches. Please try again.");
  }

  return (data ?? []).map((row: any) => {
    const fursuit = row.fursuit;
    const convention = row.convention;
    return {
      catchId: row.id,
      fursuitId: fursuit?.id ?? '',
      fursuitName: fursuit?.name ?? 'Unknown Fursuit',
      fursuitAvatarPath: fursuit?.avatar_path ?? null,
      fursuitAvatarUrl: resolveStorageMediaUrl({
        bucket: FURSUIT_BUCKET,
        path: fursuit?.avatar_path ?? null,
        legacyUrl: fursuit?.avatar_url ?? null,
      }),
      conventionId: row.convention_id ?? null,
      conventionName: convention?.name ?? 'Unknown Convention',
      caughtAt: row.caught_at ?? '',
      expiresAt: row.expires_at ?? null,
    } satisfies MyPendingCatch;
  });
}
