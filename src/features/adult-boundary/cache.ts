import type { QueryClient } from '@tanstack/react-query';

import {
  ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY,
  CONVENTION_RECAP_DETAIL_QUERY_KEY,
  CONVENTION_SUIT_ROSTER_CAUGHT_IDS_QUERY_KEY,
  CONVENTION_SUIT_ROSTER_QUERY_KEY,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  clearCatchConventionSnapshotsForUser,
} from '../conventions';
import { DAILY_TASKS_QUERY_KEY } from '../daily-tasks/hooks';
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
} from '../leaderboard';
import { CAUGHT_SUITS_QUERY_KEY, FURSUIT_DETAIL_QUERY_KEY, MY_SUITS_QUERY_KEY } from '../suits';
import { profileQueryKey } from '../profile';

const USER_AUDIENCE_QUERY_PREFIXES = [
  [MY_SUITS_QUERY_KEY],
  [CAUGHT_SUITS_QUERY_KEY],
  [FURSUIT_DETAIL_QUERY_KEY],
  [ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY],
  [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY],
  [CONVENTION_SUIT_ROSTER_QUERY_KEY],
  [CONVENTION_SUIT_ROSTER_CAUGHT_IDS_QUERY_KEY],
  [CONVENTION_LEADERBOARD_QUERY_KEY],
  [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY],
  [CONVENTION_RECAP_DETAIL_QUERY_KEY],
  [DAILY_TASKS_QUERY_KEY],
] as const;

export async function refreshAdultBoundaryCaches(params: {
  queryClient: QueryClient;
  userId: string;
}) {
  const { queryClient, userId } = params;

  queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
  await Promise.all([
    clearCatchConventionSnapshotsForUser(userId),
    ...USER_AUDIENCE_QUERY_PREFIXES.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ]);
}
