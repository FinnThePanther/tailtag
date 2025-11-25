import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth';
import { useToast } from '../../../hooks/useToast';
import { captureHandledException } from '../../../lib/sentry';
import {
  confirmCatch,
  pendingCatchesQueryKey,
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
      conventionId,
    }: {
      catchId: string;
      decision: 'accept' | 'reject';
      reason?: string;
      conventionId?: string;
    }) => {
      if (!userId) {
        throw new Error('You must be signed in to confirm catches.');
      }
      return confirmCatch(catchId, userId, decision, reason, conventionId);
    },
    onMutate: async ({ catchId }) => {
      /**
       * Optimistic Update Flow:
       * 1. Cancel in-flight queries to prevent race conditions
       * 2. Snapshot current state for potential rollback
       * 3. Immediately update UI by removing the catch from the list
       * 4. Return snapshot for use in onError rollback
       *
       * Why no onSettled refetch?
       * - The optimistic update + server mutation is sufficient
       * - Realtime subscriptions will push any external changes
       * - Avoiding unnecessary refetches improves perceived performance
       * - onError already handles rollback if the mutation fails
       */
      await queryClient.cancelQueries({
        queryKey: pendingCatchesQueryKey(userId ?? ''),
      });

      const previousCatches = queryClient.getQueryData<PendingCatch[]>(
        pendingCatchesQueryKey(userId ?? '')
      );

      if (previousCatches) {
        queryClient.setQueryData<PendingCatch[]>(
          pendingCatchesQueryKey(userId ?? ''),
          previousCatches.filter((c) => c.catchId !== catchId)
        );
      }

      return { previousCatches };
    },
    onSuccess: (result) => {
      const message =
        result.decision === 'accept'
          ? 'Catch approved! The catcher has been notified and it now counts in their collection.'
          : 'Catch request declined. The catcher has been notified.';
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
  });
}
