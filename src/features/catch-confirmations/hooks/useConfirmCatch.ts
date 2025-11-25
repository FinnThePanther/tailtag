import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth';
import { useToast } from '../../../hooks/useToast';
import { captureHandledException } from '../../../lib/sentry';
import {
  confirmCatch,
  pendingCatchesQueryKey,
  pendingCatchCountQueryKey,
} from '../api/confirmations';
import type { PendingCatch } from '../types';

type UseConfirmCatchOptions = {
  onSuccess?: (decision: 'accept' | 'reject') => void;
};

export function useConfirmCatch(options?: UseConfirmCatchOptions) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({
      catchId,
      decision,
      reason,
    }: {
      catchId: string;
      decision: 'accept' | 'reject';
      reason?: string;
    }) => {
      if (!userId) {
        throw new Error('You must be signed in to confirm catches.');
      }
      return confirmCatch(catchId, userId, decision, reason);
    },
    onMutate: async ({ catchId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: pendingCatchesQueryKey(userId ?? ''),
      });

      // Snapshot current state
      const previousCatches = queryClient.getQueryData<PendingCatch[]>(
        pendingCatchesQueryKey(userId ?? '')
      );
      const previousCount = queryClient.getQueryData<number>(
        pendingCatchCountQueryKey(userId ?? '')
      );

      // Optimistically remove the catch from the list
      if (previousCatches) {
        queryClient.setQueryData<PendingCatch[]>(
          pendingCatchesQueryKey(userId ?? ''),
          previousCatches.filter((c) => c.catchId !== catchId)
        );
      }

      // Optimistically decrement the count
      if (typeof previousCount === 'number' && previousCount > 0) {
        queryClient.setQueryData<number>(
          pendingCatchCountQueryKey(userId ?? ''),
          previousCount - 1
        );
      }

      return { previousCatches, previousCount };
    },
    onSuccess: (result) => {
      const message =
        result.decision === 'accept'
          ? 'Catch approved!'
          : 'Catch request declined.';
      showToast(message);
      options?.onSuccess?.(result.decision);
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousCatches !== undefined) {
        queryClient.setQueryData<PendingCatch[]>(
          pendingCatchesQueryKey(userId ?? ''),
          context.previousCatches
        );
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData<number>(
          pendingCatchCountQueryKey(userId ?? ''),
          context.previousCount
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : "We couldn't process that request. Please try again.";
      showToast(message);

      captureHandledException(error, {
        scope: 'catch-confirmations.useConfirmCatch',
        userId,
      });
    },
    onSettled: () => {
      // Refetch to ensure consistency
      void queryClient.invalidateQueries({
        queryKey: pendingCatchesQueryKey(userId ?? ''),
      });
      void queryClient.invalidateQueries({
        queryKey: pendingCatchCountQueryKey(userId ?? ''),
      });
    },
  });
}
