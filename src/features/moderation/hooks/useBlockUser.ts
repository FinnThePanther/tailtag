import { useMutation, useQueryClient } from '@tanstack/react-query';
import { blockUser, BLOCKED_USERS_QUERY_KEY, BLOCKED_IDS_QUERY_KEY } from '../api/blocks';
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
} from '../../leaderboard';

export function useBlockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (blockedId: string) => blockUser(blockedId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BLOCKED_USERS_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [BLOCKED_IDS_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY] });
    },
  });
}
