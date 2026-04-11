import { supabase } from '../../../lib/supabase';
import type { UserBlock } from '../types';
import { PROFILE_AVATAR_BUCKET } from '../../../constants/storage';
import { resolveStorageMediaUrl } from '../../../utils/supabase-image';

export const BLOCKED_USERS_QUERY_KEY = 'blocked-users';
export const BLOCKED_IDS_QUERY_KEY = 'blocked-ids';

export const blockedUsersQueryKey = (userId: string) => [BLOCKED_USERS_QUERY_KEY, userId] as const;

export const blockedIdsQueryKey = (userId: string) => [BLOCKED_IDS_QUERY_KEY, userId] as const;

export async function fetchBlockedUsers(userId: string): Promise<UserBlock[]> {
  const { data, error } = await (supabase as any).rpc('get_blocked_users', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Could not load blocked users: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    blockerId: row.blocker_id,
    blockedId: row.blocked_id,
    blockedUsername: row.blocked_username ?? null,
    blockedAvatarUrl: resolveStorageMediaUrl({
      bucket: PROFILE_AVATAR_BUCKET,
      path: null,
      legacyUrl: row.blocked_avatar_url ?? null,
    }),
    createdAt: row.created_at,
  }));
}

export async function fetchBlockedIds(userId: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', userId);

  if (error) {
    throw new Error(`Could not load blocked IDs: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.blocked_id as string);
}

export async function blockUser(blockedId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await (supabase as any)
    .from('user_blocks')
    .insert({ blocker_id: user.id, blocked_id: blockedId });

  if (error) {
    if (error.code === '23505') {
      // Already blocked — not an error from the user's perspective
      return;
    }
    throw new Error(`Could not block user: ${error.message}`);
  }
}

export async function unblockUser(blockedId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await (supabase as any)
    .from('user_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);

  if (error) {
    throw new Error(`Could not unblock user: ${error.message}`);
  }
}

export async function checkIsBlocked(otherUserId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await (supabase as any).rpc('is_blocked', {
    p_user_a: user.id,
    p_user_b: otherUserId,
  });

  if (error) {
    return false;
  }

  return data === true;
}
