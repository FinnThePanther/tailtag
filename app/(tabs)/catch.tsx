import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import {
  CAUGHT_COLLECTION_QUERY_KEY,
  CAUGHT_SUITS_QUERY_KEY,
  fetchFursuitDetail,
  fursuitDetailQueryKey,
} from '../../src/features/suits';
import type { FursuitBio } from '../../src/features/suits';
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
} from '../../src/features/leaderboard';
import {
  createCatch,
  createReciprocalCatchOffer,
  CODE_CATCH_OUTBOX_TIMEOUT_MS,
  submitPhotoCatchBatch,
  myPendingCatchesQueryKey,
  pendingCatchesQueryKey,
  PhotoCatchCard,
  ReciprocalCatchSelector,
  type CatchStatus,
  type CreateCatchResult,
  type PhotoCatchBatchResult,
  type PhotoCatchBatchItemResult,
  type ReciprocalCatchOfferResult,
} from '../../src/features/catch-confirmations';
import {
  queueCodeCatchOutboxItem,
  updateCatchOutboxItem,
  useCatchOutboxSync,
} from '../../src/features/catch-outbox';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { AppImage } from '../../src/components/ui/AppImage';
import { KeyboardAwareFormWrapper } from '../../src/components/ui/KeyboardAwareFormWrapper';
import { useAuth } from '../../src/features/auth';
import {
  formatConventionCloseoutDeadline,
  getConventionPlayerLifecycleState,
  type ConventionMembership,
  useCatchConventionContext,
  useConventionVerificationAction,
} from '../../src/features/conventions';
import { DAILY_TASKS_QUERY_KEY } from '../../src/features/daily-tasks/hooks';
import { achievementsStatusQueryKey } from '../../src/features/achievements';
import { captureHandledException, addMonitoringBreadcrumb } from '../../src/lib/sentry';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import {
  createCatchPerformanceTrace,
  createClientAttemptId,
} from '../../src/features/catch-confirmations/lib/catchPerformance';
import { colors, spacing } from '../../src/theme';
import { isValidUniqueCodeInput, normalizeUniqueCodeInput } from '../../src/utils/code';
import { UNIQUE_CODE_LENGTH, UNIQUE_CODE_MIN_LENGTH } from '../../src/constants/codes';
import { FURSUIT_BUCKET } from '../../src/constants/storage';
import { resolveStorageMediaUrl } from '../../src/utils/supabase-image';
import { styles } from '../../src/app-styles/(tabs)/catch.styles';

type PostCatchFursuit = {
  id: string | null;
  name: string;
  avatar_url: string | null;
  owner_id: string | null;
  catch_count: number;
  bio: FursuitBio | null;
};

type CatchRecord = {
  id: string;
  caught_at: string | null;
  catch_number: number | null;
  status: CatchStatus;
  photo_upload_state?: CreateCatchResult['photoUploadState'];
};

type PhotoBatchSummary = {
  saved: number;
  pending: number;
  failed: number;
};

type CatchLifecycleConvention = {
  membership: ConventionMembership;
  state: 'finalizing' | 'recap_delayed';
};

const SHARED_CONVENTION_HELP =
  'This suit is not catchable at your playable convention yet. Both players must be Ready to catch for the same live event, and the fursuit owner must list that specific suit for the event.';

function reciprocalOfferMessage(offer: ReciprocalCatchOfferResult | null | undefined) {
  if (!offer) return null;
  if (offer.status === 'COMPLETED') {
    return offer.offeredFursuitName
      ? `Back-tag recorded for ${offer.offeredFursuitName}.`
      : 'Back-tag recorded.';
  }
  if (offer.status === 'PENDING') {
    return offer.offeredFursuitName
      ? `Back-tag for ${offer.offeredFursuitName} will complete if they approve this catch.`
      : 'Back-tag will complete if they approve this catch.';
  }
  if (offer.status === 'FAILED') {
    return "Original catch saved, but the back-tag couldn't be completed.";
  }
  return null;
}

function isRetryableCatchSubmissionError(error: unknown) {
  if (!(error instanceof Error)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('signed in')
  );
}

function catchSubmissionErrorCode(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'errorCode' in error &&
    typeof error.errorCode === 'string' &&
    error.errorCode.trim()
  ) {
    return error.errorCode;
  }

  if (!(error instanceof Error)) return 'unknown_error';
  const message = error.message.toLowerCase();
  if (message.includes('timed out')) return 'timeout';
  if (message.includes('network') || message.includes('failed to fetch')) return 'network_error';
  if (message.includes("couldn't find")) return 'code_not_found';
  if (message.includes('already caught')) return 'already_caught';
  if (message.includes('own suits')) return 'self_catch';
  if (message.includes('share a playable convention') || message.includes('not catchable')) {
    return 'shared_convention_required';
  }
  if (message.includes('new catches are closed')) return 'convention_catch_closed';
  if (message.includes('cannot catch')) return 'blocked_user';
  return 'server_rejected';
}

function selectConversationPrompt(bio: FursuitBio | null | undefined) {
  return (
    [bio?.askMeAbout, bio?.likesAndInterests]
      .map((value) => value?.trim())
      .find((value): value is string => Boolean(value)) ?? null
  );
}

function buildFallbackPostCatchFursuit(
  catchResult: CreateCatchResult,
  fallbackName: string,
): PostCatchFursuit {
  return {
    id: catchResult.fursuitId ?? null,
    name: catchResult.fursuitName?.trim() || fallbackName,
    avatar_url: resolveStorageMediaUrl({
      bucket: FURSUIT_BUCKET,
      path: catchResult.fursuitAvatarPath ?? null,
      legacyUrl: catchResult.fursuitAvatarUrl ?? null,
    }),
    owner_id: catchResult.fursuitOwnerId,
    catch_count: catchResult.requiresApproval ? 0 : (catchResult.catchNumber ?? 1),
    bio: null,
  };
}

async function resolvePostCatchFursuit(
  catchResult: CreateCatchResult,
  viewerId: string,
  fallbackName: string,
): Promise<PostCatchFursuit> {
  const fallback = buildFallbackPostCatchFursuit(catchResult, fallbackName);

  if (!catchResult.fursuitId) {
    return fallback;
  }

  try {
    const detail = await fetchFursuitDetail(catchResult.fursuitId, viewerId);
    return {
      id: detail.id,
      name: detail.name,
      avatar_url: detail.avatar_url,
      owner_id: detail.owner_id,
      catch_count:
        catchResult.requiresApproval || catchResult.catchNumber === null
          ? detail.catchCount
          : Math.max(detail.catchCount, catchResult.catchNumber),
      bio: detail.bio,
    };
  } catch (caught) {
    captureHandledException(caught, {
      scope: 'catch.resolvePostCatchFursuit',
      userId: viewerId,
      fursuitId: catchResult.fursuitId,
      catchId: catchResult.catchId,
    });
    return fallback;
  }
}

function postCatchMessage(params: {
  isPending: boolean;
  fursuitName: string;
  conversationPrompt: string | null;
}) {
  if (params.isPending) {
    return params.conversationPrompt
      ? 'In the meantime, use their prompt to start a conversation.'
      : 'In the meantime, start a conversation while you wait for approval.';
  }

  return params.conversationPrompt
    ? `You just tagged ${params.fursuitName}. Use their prompt to start a conversation.`
    : `You just tagged ${params.fursuitName}. Start a conversation while the catch is fresh.`;
}

function photoBatchStatusLabel(result: PhotoCatchBatchItemResult) {
  switch (result.status) {
    case 'confirmed':
      return 'Saved';
    case 'pending_approval':
      return 'Pending approval';
    case 'photo_pending':
      return 'Photo pending';
    case 'already_caught':
      return 'Already caught';
    case 'not_eligible':
      return 'Not eligible';
    case 'failed':
      return 'Failed';
  }
}

function summarizePhotoBatch(result: PhotoCatchBatchResult): PhotoBatchSummary {
  return result.results.reduce(
    (summary, item) => {
      if (item.status === 'confirmed' || item.status === 'photo_pending') {
        summary.saved += 1;
      } else if (item.status === 'pending_approval') {
        summary.pending += 1;
      } else {
        summary.failed += 1;
      }
      return summary;
    },
    { saved: 0, pending: 0, failed: 0 },
  );
}

export default function CatchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const { sync: syncOutbox } = useCatchOutboxSync(userId, queryClient);
  const {
    conventionMemberships,
    activeConventionIds,
    singleActiveConventionId,
    pickerItems,
    reciprocalPickerItems,
    isMembershipLoading,
    isRosterLoading,
    isRosterRefreshing,
    isUsingRosterSnapshot,
    refresh: refreshCatchConventionContext,
  } = useCatchConventionContext(userId);
  const hasActiveConvention = useMemo(() => activeConventionIds.length > 0, [activeConventionIds]);
  const photoCatchConventionOptions = useMemo(
    () =>
      conventionMemberships.map((membership) => ({
        id: membership.convention_id,
        name: membership.name,
      })),
    [conventionMemberships],
  );
  const verificationRequiredConvention = useMemo(
    () =>
      hasActiveConvention
        ? null
        : (conventionMemberships.find(
            (membership) => membership.membership_state === 'needs_location_verification',
          ) ?? null),
    [conventionMemberships, hasActiveConvention],
  );
  const photoCatchUnavailableReason = useMemo(() => {
    if (hasActiveConvention) {
      return null;
    }

    if (verificationRequiredConvention) {
      return `Verify your location for ${verificationRequiredConvention.name} before logging photo catches.`;
    }

    if (isMembershipLoading) {
      return 'Loading your convention status. Please try again in a moment.';
    }

    return 'Photo catches open when you are ready to catch at a live convention. Join or verify a convention before using camera or gallery catches.';
  }, [hasActiveConvention, isMembershipLoading, verificationRequiredConvention]);
  const leaderboardOpenConvention = useMemo(
    () =>
      hasActiveConvention
        ? null
        : (conventionMemberships.find(
            (membership) => membership.membership_state === 'leaderboard_open',
          ) ?? null),
    [conventionMemberships, hasActiveConvention],
  );
  const catchLifecycleConvention = useMemo<CatchLifecycleConvention | null>(() => {
    const relevantConventionMemberships =
      activeConventionIds.length > 0
        ? conventionMemberships.filter(
            (membership) =>
              activeConventionIds.includes(membership.convention_id) ||
              activeConventionIds.includes(membership.id),
          )
        : conventionMemberships;

    const finalizingConvention = relevantConventionMemberships.find(
      (membership) => getConventionPlayerLifecycleState(membership) === 'finalizing',
    );
    if (finalizingConvention) {
      return { membership: finalizingConvention, state: 'finalizing' };
    }

    const delayedConvention = relevantConventionMemberships.find(
      (membership) => getConventionPlayerLifecycleState(membership) === 'recap_delayed',
    );
    if (delayedConvention) {
      return { membership: delayedConvention, state: 'recap_delayed' };
    }

    return null;
  }, [activeConventionIds, conventionMemberships]);
  const catchLifecycleDeadlineLabel = useMemo(() => {
    if (catchLifecycleConvention?.state !== 'finalizing') {
      return null;
    }

    return formatConventionCloseoutDeadline(
      catchLifecycleConvention.membership.closeout_not_before,
      catchLifecycleConvention.membership.timezone,
    );
  }, [catchLifecycleConvention]);
  const { verifyConvention, verificationModals, isVerifyingConvention } =
    useConventionVerificationAction({
      profileId: userId,
      onVerified: async () => {
        await refreshCatchConventionContext();
      },
    });

  const [codeInput, setCodeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPhotoSubmitting, setIsPhotoSubmitting] = useState(false);
  const [photoSubmitError, setPhotoSubmitError] = useState<string | null>(null);
  const [caughtFursuit, setCaughtFursuit] = useState<PostCatchFursuit | null>(null);
  const [photoBatchResult, setPhotoBatchResult] = useState<PhotoCatchBatchResult | null>(null);
  const [isRetryingPhotoBatch, setIsRetryingPhotoBatch] = useState(false);
  const [catchRecord, setCatchRecord] = useState<CatchRecord | null>(null);
  const [catchNumber, setCatchNumber] = useState<number | null>(null);
  const [conversationPrompt, setConversationPrompt] = useState<string | null>(null);
  const [selectedReciprocalFursuitId, setSelectedReciprocalFursuitId] = useState<string | null>(
    null,
  );
  const [isOfferingReciprocalCatch, setIsOfferingReciprocalCatch] = useState(false);
  const [hasSubmittedReciprocalOffer, setHasSubmittedReciprocalOffer] = useState(false);
  const [reciprocalFeedback, setReciprocalFeedback] = useState<string | null>(null);
  const [lastCatchConventionId, setLastCatchConventionId] = useState<string | null>(null);
  const [lastCatchConventionIds, setLastCatchConventionIds] = useState<string[]>([]);
  const isCodeCatchConventionContextReady = Boolean(singleActiveConventionId);
  const isLifecycleCatchBlocked = Boolean(catchLifecycleConvention);

  const resetCatchState = useCallback(() => {
    setCaughtFursuit(null);
    setPhotoBatchResult(null);
    setIsRetryingPhotoBatch(false);
    setCatchRecord(null);
    setCatchNumber(null);
    setConversationPrompt(null);
    setSelectedReciprocalFursuitId(null);
    setIsOfferingReciprocalCatch(false);
    setHasSubmittedReciprocalOffer(false);
    setReciprocalFeedback(null);
    setLastCatchConventionId(null);
    setLastCatchConventionIds([]);
  }, []);

  const completedCatchReciprocalFursuits = useMemo(
    () =>
      lastCatchConventionId
        ? reciprocalPickerItems.filter((item) => item.conventionIds.includes(lastCatchConventionId))
        : [],
    [lastCatchConventionId, reciprocalPickerItems],
  );

  // Clear caught fursuit state when user navigates away
  useFocusEffect(
    useCallback(() => {
      void syncOutbox();

      return () => {
        // Cleanup on blur (when navigating away)
        resetCatchState();
        setSubmitError(null);
        setSelectedReciprocalFursuitId(null);
      };
    }, [resetCatchState, syncOutbox]),
  );

  const isPending = catchRecord?.status === 'PENDING';

  const scheduleCatchSurfaceRefresh = useCallback(
    (params: { fursuitId: string; conventionIds: string[]; catchResult: CreateCatchResult }) => {
      if (!userId) {
        return;
      }
      const currentUserId = userId;
      setTimeout(() => {
        void refreshCatchConventionContext();
        void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
        void queryClient.invalidateQueries({
          queryKey: fursuitDetailQueryKey(params.fursuitId),
        });
        if (params.catchResult.reciprocalOffer?.status === 'COMPLETED') {
          const reciprocalFursuitId = params.catchResult.reciprocalOffer.offeredFursuitId;
          if (reciprocalFursuitId) {
            void queryClient.invalidateQueries({
              queryKey: fursuitDetailQueryKey(reciprocalFursuitId),
            });
          }
        }
        params.conventionIds.forEach((conventionId) => {
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
          });
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, conventionId],
          });
        });
        void queryClient.invalidateQueries({
          queryKey: [CAUGHT_SUITS_QUERY_KEY, currentUserId],
        });
        void queryClient.invalidateQueries({
          queryKey: [CAUGHT_COLLECTION_QUERY_KEY, currentUserId],
        });
        void queryClient.invalidateQueries({
          queryKey: achievementsStatusQueryKey(currentUserId),
        });

        if (params.catchResult.requiresApproval && params.catchResult.fursuitOwnerId) {
          void queryClient.invalidateQueries({
            queryKey: pendingCatchesQueryKey(params.catchResult.fursuitOwnerId),
          });
        }

        if (params.catchResult.status === 'PENDING') {
          void queryClient.invalidateQueries({
            queryKey: myPendingCatchesQueryKey(currentUserId),
          });
        }
      }, 0);
    },
    [queryClient, refreshCatchConventionContext, userId],
  );

  const schedulePhotoBatchSurfaceRefresh = useCallback(
    (batchResult: PhotoCatchBatchResult) => {
      if (!userId) {
        return;
      }

      const currentUserId = userId;
      const fursuitIds = new Set<string>();
      const conventionIds = new Set<string>();
      const ownerIds = new Set<string>();
      let hasPendingCatch = false;

      batchResult.results.forEach((result) => {
        if (!result.catchResult) return;
        if (result.catchResult.fursuitId) {
          fursuitIds.add(result.catchResult.fursuitId);
        }
        if (result.catchResult.conventionId) {
          conventionIds.add(result.catchResult.conventionId);
        }
        if (result.catchResult.requiresApproval && result.catchResult.fursuitOwnerId) {
          ownerIds.add(result.catchResult.fursuitOwnerId);
        }
        if (result.catchResult.status === 'PENDING') {
          hasPendingCatch = true;
        }
      });

      setTimeout(() => {
        void refreshCatchConventionContext();
        void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
        fursuitIds.forEach((fursuitId) => {
          void queryClient.invalidateQueries({
            queryKey: fursuitDetailQueryKey(fursuitId),
          });
        });
        conventionIds.forEach((conventionId) => {
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
          });
          void queryClient.invalidateQueries({
            queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, conventionId],
          });
        });
        void queryClient.invalidateQueries({
          queryKey: [CAUGHT_SUITS_QUERY_KEY, currentUserId],
        });
        void queryClient.invalidateQueries({
          queryKey: [CAUGHT_COLLECTION_QUERY_KEY, currentUserId],
        });
        void queryClient.invalidateQueries({
          queryKey: achievementsStatusQueryKey(currentUserId),
        });
        ownerIds.forEach((ownerId) => {
          void queryClient.invalidateQueries({
            queryKey: pendingCatchesQueryKey(ownerId),
          });
        });
        if (hasPendingCatch) {
          void queryClient.invalidateQueries({
            queryKey: myPendingCatchesQueryKey(currentUserId),
          });
        }
      }, 0);
    },
    [queryClient, refreshCatchConventionContext, userId],
  );

  const handleSubmit = async () => {
    if (!userId || isSubmitting) {
      return;
    }

    const normalizedCode = normalizeUniqueCodeInput(codeInput);

    if (!normalizedCode) {
      setSubmitError('Enter the code from the fursuit badge to record your catch.');
      return;
    }

    if (!isValidUniqueCodeInput(normalizedCode)) {
      setSubmitError(
        `Catch codes must be ${UNIQUE_CODE_MIN_LENGTH}-${UNIQUE_CODE_LENGTH} letters or numbers.`,
      );
      return;
    }

    if (isMembershipLoading && activeConventionIds.length === 0) {
      setSubmitError('Loading your playable convention. Please try again in a moment.');
      return;
    }

    if (isLifecycleCatchBlocked) {
      setSubmitError('Catching has ended for this convention. Review your catches instead.');
      return;
    }

    if (!singleActiveConventionId) {
      setSubmitError('TailTag needs one active playable convention before recording this catch.');
      return;
    }

    const catchConventionId = singleActiveConventionId;

    setIsSubmitting(true);
    setSubmitError(null);
    resetCatchState();

    const clientAttemptId = createClientAttemptId();
    try {
      await queueCodeCatchOutboxItem({
        userId,
        clientAttemptId,
        fursuitCode: normalizedCode,
        conventionId: catchConventionId,
      });
    } catch (caught) {
      captureHandledException(caught, {
        scope: 'catch.performCatch.queueOutboxItem',
        userId,
        clientAttemptId,
      });
    }

    const catchTrace = createCatchPerformanceTrace({ method: 'code', clientAttemptId });
    let catchTraceFinished = false;
    const finishCatchTrace = (options: {
      result: 'success' | 'pending_approval' | 'failed' | 'timeout';
      catchId?: string | null;
      conventionId?: string | null;
      errorCode?: string | null;
    }) => {
      if (catchTraceFinished) {
        return;
      }
      catchTraceFinished = true;
      catchTrace.finish(options);
    };

    try {
      addMonitoringBreadcrumb({
        category: 'catch',
        message: 'Catch initiated',
        data: {
          clientAttemptId,
          method: 'code',
        },
      });
      const catchResult = await createCatch({
        fursuitCode: normalizedCode,
        conventionId: catchConventionId,
        clientAttemptId,
        method: 'code',
        timeoutMs: CODE_CATCH_OUTBOX_TIMEOUT_MS,
      });
      catchTrace.recordTiming('edge_request_ms', catchResult.edgeRequestMs);

      const stopPostCreateRenderTiming = catchTrace.startTiming('post_create_render_ms');

      const normalizedCatchRecord: CatchRecord = {
        id: catchResult.catchId,
        caught_at: new Date().toISOString(),
        catch_number: catchResult.catchNumber,
        status: catchResult.status,
        photo_upload_state: catchResult.photoUploadState,
      };
      const normalizedFursuit = await resolvePostCatchFursuit(
        catchResult,
        userId,
        `Code ${normalizedCode}`,
      );

      await updateCatchOutboxItem(userId, clientAttemptId, (item) => ({
        ...item,
        status: catchResult.requiresApproval ? 'pending_approval' : 'confirmed',
        catchId: catchResult.catchId,
        catchNumber: catchResult.catchNumber,
        conventionId: catchResult.conventionId,
        fursuitId: catchResult.fursuitId,
        fursuitName: catchResult.fursuitName,
        fursuitAvatarPath: catchResult.fursuitAvatarPath,
        fursuitAvatarUrl: catchResult.fursuitAvatarUrl,
        fursuitSpeciesName: catchResult.fursuitSpeciesName,
        resolvedAt: new Date().toISOString(),
        errorCode: undefined,
        errorMessage: undefined,
      }));

      setCaughtFursuit({
        ...normalizedFursuit,
      });
      setCatchRecord(normalizedCatchRecord);
      setLastCatchConventionId(catchResult.conventionId);
      setLastCatchConventionIds(catchResult.conventionId ? [catchResult.conventionId] : []);
      setCatchNumber(normalizedCatchRecord.catch_number ?? normalizedFursuit.catch_count);
      setConversationPrompt(selectConversationPrompt(normalizedFursuit.bio));
      setReciprocalFeedback(reciprocalOfferMessage(catchResult.reciprocalOffer));
      stopPostCreateRenderTiming();
      finishCatchTrace({
        result: catchResult.requiresApproval ? 'pending_approval' : 'success',
        catchId: catchResult.catchId,
        conventionId: catchResult.conventionId,
      });
      if (catchResult.fursuitId) {
        scheduleCatchSurfaceRefresh({
          fursuitId: catchResult.fursuitId,
          conventionIds: catchResult.conventionId ? [catchResult.conventionId] : [],
          catchResult,
        });
      }

      setCodeInput('');

      // Events are now fired by the Edge Function, no need to emit here
    } catch (caught) {
      const caughtWithTiming = caught as {
        catchPerformanceResult?: 'failed' | 'timeout';
        edgeRequestMs?: number | null;
        errorCode?: string | null;
      };
      catchTrace.recordTiming('edge_request_ms', caughtWithTiming.edgeRequestMs);
      finishCatchTrace({
        result: caughtWithTiming.catchPerformanceResult ?? 'failed',
        errorCode:
          caughtWithTiming.errorCode ??
          (caughtWithTiming.catchPerformanceResult === 'timeout' ? 'edge_timeout' : 'error'),
      });
      resetCatchState();

      const fallbackMessage = getUserVisibleErrorMessage(
        caught,
        "We couldn't save that catch. Please try again.",
      );
      if (isRetryableCatchSubmissionError(caught)) {
        await updateCatchOutboxItem(userId, clientAttemptId, (item) => ({
          ...item,
          status: 'queued',
          lastAttemptAt: new Date().toISOString(),
          retryCount: item.retryCount + 1,
          errorCode: catchSubmissionErrorCode(caught),
          errorMessage: fallbackMessage,
        }));
        setSubmitError("Queued. We'll finish this when your connection improves.");
        void syncOutbox();
      } else {
        await updateCatchOutboxItem(userId, clientAttemptId, (item) => ({
          ...item,
          status: 'failed',
          lastAttemptAt: new Date().toISOString(),
          resolvedAt: new Date().toISOString(),
          retryCount: item.retryCount + 1,
          errorCode: catchSubmissionErrorCode(caught),
          errorMessage: fallbackMessage,
        }));
        setSubmitError(fallbackMessage);
      }

      captureHandledException(caught, {
        scope: 'catch.performCatch',
        userId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const showConventionSettingsAction = Boolean(
    submitError &&
    (submitError === SHARED_CONVENTION_HELP ||
      submitError.includes('Join or verify a playable convention')),
  );

  const handleCatchAnother = () => {
    resetCatchState();
    setSubmitError(null);
    setCodeInput('');
    setSelectedReciprocalFursuitId(null);
  };

  const handleOfferReciprocalCatch = async () => {
    if (!catchRecord || !selectedReciprocalFursuitId || isOfferingReciprocalCatch) {
      return;
    }

    const reciprocalFursuitId = completedCatchReciprocalFursuits.some(
      (item) => item.id === selectedReciprocalFursuitId,
    )
      ? selectedReciprocalFursuitId
      : null;

    if (!reciprocalFursuitId) {
      setReciprocalFeedback('Choose one of your listed suits to offer a back-tag.');
      return;
    }

    setIsOfferingReciprocalCatch(true);
    setReciprocalFeedback(null);

    try {
      const reciprocalOffer = await createReciprocalCatchOffer({
        primaryCatchId: catchRecord.id,
        offeredFursuitId: reciprocalFursuitId,
      });

      setReciprocalFeedback(reciprocalOfferMessage(reciprocalOffer));
      setSelectedReciprocalFursuitId(null);
      setHasSubmittedReciprocalOffer(true);

      if (reciprocalOffer.status === 'COMPLETED' && reciprocalOffer.offeredFursuitId) {
        void queryClient.invalidateQueries({
          queryKey: fursuitDetailQueryKey(reciprocalOffer.offeredFursuitId),
        });
      }

      void refreshCatchConventionContext();
      lastCatchConventionIds.forEach((conventionId) => {
        void queryClient.invalidateQueries({
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
        });
        void queryClient.invalidateQueries({
          queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, conventionId],
        });
      });
    } catch (caught) {
      setReciprocalFeedback(
        getUserVisibleErrorMessage(caught, "We couldn't offer that back-tag. Please try again."),
      );
      captureHandledException(caught, {
        scope: 'catch.offerReciprocalCatch',
        userId,
        catchId: catchRecord.id,
      });
    } finally {
      setIsOfferingReciprocalCatch(false);
    }
  };

  const handlePhotoCatch = async (batchResult: PhotoCatchBatchResult) => {
    if (!userId) return;

    setIsPhotoSubmitting(true);
    setPhotoSubmitError(null);
    resetCatchState();

    try {
      const createdResults = batchResult.results.filter((result) => result.catchResult);
      addMonitoringBreadcrumb({
        category: 'catch',
        message: 'Photo catch completed',
        data: {
          batchId: batchResult.batchId,
          conventionId: batchResult.conventionId,
          resultCount: batchResult.results.length,
          createdCount: createdResults.length,
          method: 'photo',
        },
      });

      if (batchResult.results.length === 1) {
        if (createdResults.length === 0) {
          const singleResult = batchResult.results[0];
          setPhotoSubmitError(
            singleResult.message ?? "We couldn't save that catch. Please try again.",
          );
          return;
        }

        const singleResult = createdResults[0];
        const catchResult = singleResult.catchResult!;
        const normalizedFursuit = await resolvePostCatchFursuit(
          catchResult,
          userId,
          catchResult.fursuitName ?? singleResult.fursuit.name,
        );

        setCaughtFursuit(normalizedFursuit);
        setCatchRecord({
          id: catchResult.catchId,
          caught_at: new Date().toISOString(),
          catch_number: catchResult.catchNumber,
          status: catchResult.status,
          photo_upload_state: catchResult.photoUploadState,
        });
        setLastCatchConventionId(batchResult.conventionId);
        setLastCatchConventionIds(batchResult.conventionId ? [batchResult.conventionId] : []);
        setCatchNumber(catchResult.catchNumber);
        setConversationPrompt(selectConversationPrompt(normalizedFursuit.bio));
        setReciprocalFeedback(reciprocalOfferMessage(catchResult.reciprocalOffer));
        scheduleCatchSurfaceRefresh({
          fursuitId: catchResult.fursuitId ?? singleResult.fursuit.id,
          conventionIds: batchResult.conventionId ? [batchResult.conventionId] : [],
          catchResult,
        });
        return;
      }

      setPhotoBatchResult(batchResult);
      schedulePhotoBatchSurfaceRefresh(batchResult);
    } catch (caught) {
      const fallbackMessage = getUserVisibleErrorMessage(
        caught,
        "We couldn't save that catch. Please try again.",
      );
      setPhotoSubmitError(fallbackMessage);
      resetCatchState();

      captureHandledException(caught, {
        scope: 'catch.performPhotoCatch',
        userId,
      });
    } finally {
      setIsPhotoSubmitting(false);
    }
  };

  const handleRetryPhotoBatchFailures = async () => {
    if (!userId || !photoBatchResult || isRetryingPhotoBatch) {
      return;
    }

    const retryableResults = photoBatchResult.results.filter(
      (result) => result.status === 'failed',
    );

    if (retryableResults.length === 0) {
      return;
    }

    setIsRetryingPhotoBatch(true);
    setPhotoSubmitError(null);

    try {
      const retryResult = await submitPhotoCatchBatch({
        userId,
        localPhotoUri: photoBatchResult.localPhotoUri,
        photoSource: photoBatchResult.photoSource,
        conventionId: photoBatchResult.conventionId,
        fursuits: retryableResults.map((result) => result.fursuit),
      });
      const retriedByFursuitId = new Map(
        retryResult.results.map((result) => [result.fursuit.id, result]),
      );
      const mergedResult: PhotoCatchBatchResult = {
        ...photoBatchResult,
        results: photoBatchResult.results.map(
          (result) => retriedByFursuitId.get(result.fursuit.id) ?? result,
        ),
      };

      setPhotoBatchResult(mergedResult);
      schedulePhotoBatchSurfaceRefresh(mergedResult);
    } catch (caught) {
      setPhotoSubmitError(
        getUserVisibleErrorMessage(caught, "We couldn't retry those catches. Please try again."),
      );
      captureHandledException(caught, {
        scope: 'catch.retryPhotoBatchFailures',
        userId,
        batchId: photoBatchResult.batchId,
      });
    } finally {
      setIsRetryingPhotoBatch(false);
    }
  };

  const renderPhotoBatchResult = (batchResult: PhotoCatchBatchResult) => {
    const summary = summarizePhotoBatch(batchResult);
    const hasRetryableFailures = batchResult.results.some((result) => result.status === 'failed');

    return (
      <TailTagCard style={styles.cardSpacing}>
        <Text style={styles.sectionTitle}>Group photo catch saved</Text>
        <View style={styles.batchSummaryRow}>
          <View style={styles.batchSummaryPill}>
            <Text style={styles.batchSummaryValue}>{summary.saved}</Text>
            <Text style={styles.batchSummaryLabel}>Saved</Text>
          </View>
          <View style={styles.batchSummaryPill}>
            <Text style={styles.batchSummaryValue}>{summary.pending}</Text>
            <Text style={styles.batchSummaryLabel}>Pending</Text>
          </View>
          <View style={styles.batchSummaryPill}>
            <Text style={styles.batchSummaryValue}>{summary.failed}</Text>
            <Text style={styles.batchSummaryLabel}>Needs attention</Text>
          </View>
        </View>
        <View style={styles.batchResultList}>
          {batchResult.results.map((result) => (
            <View
              key={result.fursuit.id}
              style={styles.batchResultRow}
            >
              <AppImage
                url={result.fursuit.avatarUrl}
                width={44}
                height={44}
                style={styles.batchResultAvatar}
                accessibilityLabel={`${result.fursuit.name} profile photo`}
              />
              <View style={styles.batchResultText}>
                <Text
                  style={styles.batchResultName}
                  numberOfLines={1}
                >
                  {result.fursuit.name}
                </Text>
                <Text
                  style={styles.batchResultStatus}
                  numberOfLines={3}
                >
                  {photoBatchStatusLabel(result)}
                  {result.message ? ` • ${result.message}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
        {photoSubmitError ? (
          <Text style={[styles.sectionBody, styles.pendingHighlight]}>{photoSubmitError}</Text>
        ) : null}
        <View style={styles.buttonRow}>
          {hasRetryableFailures ? (
            <TailTagButton
              variant="outline"
              onPress={handleRetryPhotoBatchFailures}
              loading={isRetryingPhotoBatch}
              disabled={isRetryingPhotoBatch}
              style={[styles.fullWidthButton, styles.stackedButtonSpacing]}
            >
              Retry failed
            </TailTagButton>
          ) : null}
          <TailTagButton
            variant="outline"
            onPress={() => router.push('/caught')}
            style={[styles.fullWidthButton, styles.stackedButtonSpacing]}
          >
            View catches
          </TailTagButton>
          <TailTagButton
            variant="ghost"
            onPress={handleCatchAnother}
            style={styles.fullWidthButton}
          >
            Catch another suit
          </TailTagButton>
        </View>
      </TailTagCard>
    );
  };

  return (
    <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Tag Fursuits Here</Text>
        <Text style={styles.title}>Log a new catch</Text>
        <Text style={styles.subtitle}>
          Catch with a live photo, a gallery photo, or a catch code from a badge. Fursuiters do not
          need to memorize or share their code to be caught.
        </Text>
      </View>

      {!caughtFursuit && !photoBatchResult && userId ? (
        <View style={styles.photoCatchSpacing}>
          {catchLifecycleConvention ? (
            <TailTagCard style={styles.lifecycleCard}>
              <View style={styles.lifecycleTextBlock}>
                <Text style={styles.lifecycleEyebrow}>Convention update</Text>
                <Text style={styles.sectionTitle}>
                  {catchLifecycleConvention.state === 'finalizing'
                    ? `${catchLifecycleConvention.membership.name} has ended`
                    : 'Recap delayed'}
                </Text>
                <Text style={styles.sectionBody}>
                  {catchLifecycleConvention.state === 'finalizing'
                    ? catchLifecycleDeadlineLabel
                      ? `${catchLifecycleConvention.membership.name} has ended. We're finalizing catches until ${catchLifecycleDeadlineLabel}.`
                      : `${catchLifecycleConvention.membership.name} has ended. We're finalizing catches now.`
                    : `Your ${catchLifecycleConvention.membership.name} recap is delayed while we finish finalizing this convention.`}
                </Text>
              </View>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() => router.push('/caught')}
                style={styles.lifecycleCta}
              >
                Review catches
              </TailTagButton>
            </TailTagCard>
          ) : null}
          {!catchLifecycleConvention && leaderboardOpenConvention ? (
            <TailTagCard style={styles.cardSpacing}>
              <Text style={styles.sectionTitle}>Catching has ended</Text>
              <Text style={styles.sectionBody}>
                {leaderboardOpenConvention.name} standings and the fursuit roster remain available
                from Home.
              </Text>
            </TailTagCard>
          ) : null}
          {verificationRequiredConvention ? (
            <TailTagCard style={styles.cardSpacing}>
              <Text style={styles.sectionTitle}>Verify location to catch</Text>
              <Text style={styles.sectionBody}>
                {verificationRequiredConvention.name} is live. Verify that you&apos;re at the
                convention before logging catches.
              </Text>
              <TailTagButton
                variant="outline"
                onPress={() => {
                  void verifyConvention(verificationRequiredConvention);
                }}
                loading={isVerifyingConvention}
                disabled={isVerifyingConvention}
                style={styles.fullWidthButton}
              >
                Verify location
              </TailTagButton>
            </TailTagCard>
          ) : null}
          {!isLifecycleCatchBlocked ? (
            <PhotoCatchCard
              userId={userId}
              onCatchSubmit={handlePhotoCatch}
              isSubmitting={isPhotoSubmitting}
              submitError={photoSubmitError}
              activeConventionIds={activeConventionIds}
              activeConventionId={singleActiveConventionId}
              conventionOptions={photoCatchConventionOptions}
              preloadedFursuits={pickerItems}
              isRosterRefreshing={isRosterRefreshing || (isUsingRosterSnapshot && isRosterLoading)}
              catchUnavailableReason={photoCatchUnavailableReason}
            />
          ) : null}
        </View>
      ) : null}

      {!caughtFursuit && !photoBatchResult ? (
        <TailTagCard style={styles.cardSpacing}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Catch code</Text>
            <TailTagInput
              value={codeInput}
              onChangeText={(value) => {
                setCodeInput(normalizeUniqueCodeInput(value));
                setSubmitError(null);
              }}
              placeholder="PH17719"
              autoCapitalize="characters"
              maxLength={UNIQUE_CODE_LENGTH}
              editable={!isSubmitting && !isLifecycleCatchBlocked}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              style={styles.codeInput}
            />
            <Text style={styles.helpText}>
              Use this when the fursuit has a code displayed or already knows it. Otherwise, make
              the catch with a photo above.
            </Text>
            <Text style={[styles.helpText, { marginTop: spacing.xs }]}>
              Some owners require manual approval. If so, they will be notified and your catch will
              count once approved.
            </Text>
          </View>

          {submitError ? (
            <View style={styles.errorContainer}>
              <View style={styles.errorMessageRow}>
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color="#f87171"
                />
                <Text style={styles.errorText}>{submitError}</Text>
              </View>
              {verificationRequiredConvention ? (
                <TailTagButton
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    void verifyConvention(verificationRequiredConvention);
                  }}
                  loading={isVerifyingConvention}
                  disabled={isVerifyingConvention}
                >
                  Verify location
                </TailTagButton>
              ) : null}
              {showConventionSettingsAction ? (
                <TailTagButton
                  variant="outline"
                  size="sm"
                  onPress={() => router.push('/settings')}
                >
                  Open Settings
                </TailTagButton>
              ) : null}
            </View>
          ) : null}

          <TailTagButton
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={
              !userId ||
              isSubmitting ||
              isLifecycleCatchBlocked ||
              Boolean(leaderboardOpenConvention) ||
              !isCodeCatchConventionContextReady
            }
            style={styles.fullWidthButton}
          >
            Record catch
          </TailTagButton>
        </TailTagCard>
      ) : null}

      {photoBatchResult ? renderPhotoBatchResult(photoBatchResult) : null}

      {caughtFursuit ? (
        <TailTagCard
          style={isPending ? [styles.cardSpacing, styles.pendingCard] : styles.cardSpacing}
        >
          <Text style={styles.sectionTitle}>
            {isPending ? 'Catch pending approval' : 'Nice catch!'}
          </Text>
          {isPending ? (
            <>
              <Text style={[styles.sectionBody, styles.pendingHighlight]}>
                The owner of {caughtFursuit.name} will be notified.
              </Text>
              <Text style={[styles.sectionBody, styles.pendingHighlight]}>
                Your catch will count once they approve it.
              </Text>
            </>
          ) : catchNumber !== null ? (
            <Text style={[styles.sectionBody, styles.sectionHighlight]}>
              You were catcher #{catchNumber} for this suit!
            </Text>
          ) : null}
          <Text style={styles.sectionBody}>
            {postCatchMessage({
              isPending,
              fursuitName: caughtFursuit.name,
              conversationPrompt,
            })}
          </Text>
          {catchRecord?.photo_upload_state === 'pending_upload' ? (
            <View style={styles.catchProgressNotice}>
              <Ionicons
                name="cloud-upload-outline"
                size={18}
                color={colors.primary}
              />
              <View style={styles.catchProgressTextBlock}>
                <Text style={styles.catchProgressTitle}>Finalizing photo</Text>
                <Text style={styles.catchProgressBody}>
                  Your catch is saved. We&apos;ll finish the photo upload in the background.
                </Text>
              </View>
            </View>
          ) : null}
          {reciprocalFeedback ? (
            <Text style={[styles.sectionBody, styles.sectionHighlight]}>{reciprocalFeedback}</Text>
          ) : null}
          {catchRecord && !hasSubmittedReciprocalOffer ? (
            <View style={styles.reciprocalPromptGroup}>
              <ReciprocalCatchSelector
                items={completedCatchReciprocalFursuits}
                selectedId={selectedReciprocalFursuitId}
                onSelect={(id) => {
                  setSelectedReciprocalFursuitId(id);
                  setReciprocalFeedback(null);
                }}
                disabled={isOfferingReciprocalCatch}
                targetName={caughtFursuit.name}
              />
              {selectedReciprocalFursuitId ? (
                <TailTagButton
                  variant="outline"
                  onPress={handleOfferReciprocalCatch}
                  loading={isOfferingReciprocalCatch}
                  disabled={isOfferingReciprocalCatch}
                  style={styles.fullWidthButton}
                >
                  Send back-tag offer
                </TailTagButton>
              ) : null}
            </View>
          ) : null}
          {conversationPrompt ? (
            <View style={isPending ? styles.pendingPromptCard : styles.promptCard}>
              <Text style={isPending ? styles.pendingPromptLabel : styles.promptLabel}>
                Ask them about…
              </Text>
              <Text style={styles.promptBody}>{conversationPrompt}</Text>
            </View>
          ) : null}
          {caughtFursuit.id ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/fursuits/[id]',
                  params: { id: caughtFursuit.id },
                })
              }
              style={({ pressed }) => [
                styles.postCatchProfileLink,
                isPending && styles.pendingProfileLink,
                pressed && styles.postCatchProfileLinkPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`View ${caughtFursuit.name}'s fursuit profile`}
              accessibilityHint="Opens the fursuit profile with full details"
            >
              <AppImage
                url={caughtFursuit.avatar_url}
                width={56}
                height={56}
                style={styles.postCatchAvatar}
                accessibilityLabel={`${caughtFursuit.name} profile photo`}
              />
              <View style={styles.postCatchProfileText}>
                <Text
                  style={styles.postCatchProfileName}
                  numberOfLines={2}
                >
                  {caughtFursuit.name}
                </Text>
                <Text style={styles.postCatchProfileAction}>View profile</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textSubtle}
              />
            </Pressable>
          ) : (
            <View
              style={[styles.postCatchProfileLink, isPending && styles.pendingProfileLink]}
              accessibilityRole="text"
            >
              <AppImage
                url={caughtFursuit.avatar_url}
                width={56}
                height={56}
                style={styles.postCatchAvatar}
                accessibilityLabel={`${caughtFursuit.name} profile photo`}
              />
              <View style={styles.postCatchProfileText}>
                <Text
                  style={styles.postCatchProfileName}
                  numberOfLines={2}
                >
                  {caughtFursuit.name}
                </Text>
              </View>
            </View>
          )}
          <View style={styles.buttonRow}>
            <TailTagButton
              variant="outline"
              onPress={() => router.push('/caught')}
              style={[styles.fullWidthButton, styles.stackedButtonSpacing]}
            >
              View catches
            </TailTagButton>
            <TailTagButton
              variant="ghost"
              onPress={handleCatchAnother}
              style={styles.fullWidthButton}
            >
              Catch another suit
            </TailTagButton>
          </View>
        </TailTagCard>
      ) : null}
      {verificationModals}
    </KeyboardAwareFormWrapper>
  );
}
