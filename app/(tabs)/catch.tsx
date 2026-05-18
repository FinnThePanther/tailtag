import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import {
  FursuitCard,
  FursuitBioDetails,
  fursuitBioHasDisplayableContent,
  CAUGHT_SUITS_QUERY_KEY,
  applyProfileSocialLinksToBio,
  mapLatestFursuitBio,
  mapFursuitColors,
  parseSocialLinks,
  fetchFursuitMakersByFursuitIds,
  fursuitDetailQueryKey,
} from '../../src/features/suits';
import type { FursuitBio, FursuitMaker } from '../../src/features/suits';
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
} from '../../src/features/leaderboard';
import {
  createCatch,
  CODE_CATCH_OUTBOX_TIMEOUT_MS,
  myPendingCatchesQueryKey,
  pendingCatchesQueryKey,
  PhotoCatchCard,
  ReciprocalCatchSelector,
  type CatchStatus,
  type CreateCatchResult,
  type ReciprocalCatchOfferResult,
} from '../../src/features/catch-confirmations';
import {
  CatchOutboxList,
  queueCodeCatchOutboxItem,
  updateCatchOutboxItem,
  useCatchOutbox,
  useCatchOutboxSync,
  type CatchOutboxItem,
} from '../../src/features/catch-outbox';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { KeyboardAwareFormWrapper } from '../../src/components/ui/KeyboardAwareFormWrapper';
import { useAuth } from '../../src/features/auth';
import {
  formatConventionCloseoutDeadline,
  getConventionPlayerLifecycleState,
  type ConventionMembership,
  useCatchConventionContext,
  useConventionVerificationAction,
} from '../../src/features/conventions';
import { emitGameplayEvent } from '../../src/features/events';
import { DAILY_TASKS_QUERY_KEY } from '../../src/features/daily-tasks/hooks';
import { achievementsStatusQueryKey } from '../../src/features/achievements';
import { supabase } from '../../src/lib/supabase';
import { captureHandledException, addMonitoringBreadcrumb } from '../../src/lib/sentry';
import {
  createCatchPerformanceTrace,
  createClientAttemptId,
} from '../../src/features/catch-confirmations/lib/catchPerformance';
import { spacing } from '../../src/theme';
import { isValidUniqueCodeInput, normalizeUniqueCodeInput } from '../../src/utils/code';
import { toDisplayDateTime } from '../../src/utils/dates';
import { UNIQUE_CODE_LENGTH, UNIQUE_CODE_MIN_LENGTH } from '../../src/constants/codes';
import { FURSUIT_BUCKET } from '../../src/constants/storage';
import { resolveStorageMediaUrl } from '../../src/utils/supabase-image';
import { styles } from '../../src/app-styles/(tabs)/catch.styles';

import type { FursuitsRow } from '../../src/types/database';
import type { FursuitColorOption } from '../../src/features/colors';

type FursuitDetails = Pick<
  FursuitsRow,
  | 'id'
  | 'name'
  | 'species_id'
  | 'avatar_url'
  | 'unique_code'
  | 'owner_id'
  | 'is_tutorial'
  | 'catch_count'
> & {
  avatar_path?: string | null;
  created_at: string | null;
  species: string | null;
  bio: FursuitBio | null;
  colors: FursuitColorOption[];
  makers: FursuitMaker[];
};

type CatchRecord = {
  id: string;
  caught_at: string | null;
  catch_number: number | null;
  status: CatchStatus;
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
  if (message.includes('cannot catch')) return 'blocked_user';
  return 'server_rejected';
}

export default function CatchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const { visibleItems: outboxItems } = useCatchOutbox(userId);
  const {
    sync: syncOutbox,
    retry: retryOutboxItem,
    dismiss: dismissOutboxItem,
  } = useCatchOutboxSync(userId, queryClient);
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
  const verificationRequiredConvention = useMemo(
    () =>
      hasActiveConvention
        ? null
        : (conventionMemberships.find(
            (membership) => membership.membership_state === 'needs_location_verification',
          ) ?? null),
    [conventionMemberships, hasActiveConvention],
  );
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
  const [caughtFursuit, setCaughtFursuit] = useState<FursuitDetails | null>(null);
  const [catchRecord, setCatchRecord] = useState<CatchRecord | null>(null);
  const [catchNumber, setCatchNumber] = useState<number | null>(null);
  const [conversationPrompt, setConversationPrompt] = useState<string | null>(null);
  const [selectedReciprocalFursuitId, setSelectedReciprocalFursuitId] = useState<string | null>(
    null,
  );
  const [reciprocalFeedback, setReciprocalFeedback] = useState<string | null>(null);
  const [lastCatchConventionId, setLastCatchConventionId] = useState<string | null>(null);
  const [lastCatchConventionIds, setLastCatchConventionIds] = useState<string[]>([]);
  const isCodeCatchConventionContextReady = Boolean(singleActiveConventionId);
  const isLifecycleCatchBlocked = Boolean(catchLifecycleConvention);

  const resetCatchState = useCallback(() => {
    setCaughtFursuit(null);
    setCatchRecord(null);
    setCatchNumber(null);
    setConversationPrompt(null);
    setReciprocalFeedback(null);
    setLastCatchConventionId(null);
    setLastCatchConventionIds([]);
  }, []);

  const codeReciprocalFursuits = useMemo(
    () =>
      singleActiveConventionId
        ? reciprocalPickerItems.filter((item) =>
            item.conventionIds.includes(singleActiveConventionId),
          )
        : [],
    [reciprocalPickerItems, singleActiveConventionId],
  );

  const handleEditOutboxCode = useCallback(
    (item: CatchOutboxItem) => {
      if (!item.fursuitCode) {
        return;
      }

      setCodeInput(item.fursuitCode);
      setSubmitError(null);
      resetCatchState();
    },
    [resetCatchState],
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

  const lastCaughtFursuitId = caughtFursuit?.id ?? null;
  const lastCatchRecordId = catchRecord?.id ?? null;
  const isPending = catchRecord?.status === 'PENDING';

  const handleCatchCodeCopied = useCallback(() => {
    if (!userId) {
      return;
    }
    if (!lastCatchConventionId) {
      console.warn(
        'Skipping catch_shared event because no convention was recorded for the latest catch',
      );
      return;
    }
    void emitGameplayEvent({
      type: 'catch_shared',
      conventionId: lastCatchConventionId,
      payload: {
        convention_id: lastCatchConventionId,
        convention_ids: lastCatchConventionIds,
        fursuit_id: lastCaughtFursuitId,
        catch_id: lastCatchRecordId,
      },
    });
  }, [
    userId,
    lastCatchConventionId,
    lastCatchConventionIds,
    lastCaughtFursuitId,
    lastCatchRecordId,
  ]);

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
    const reciprocalFursuitId = codeReciprocalFursuits.some(
      (item) => item.id === selectedReciprocalFursuitId,
    )
      ? selectedReciprocalFursuitId
      : null;

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
        reciprocalFursuitId,
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
        reciprocalFursuitId,
      });
      catchTrace.recordTiming('edge_request_ms', catchResult.edgeRequestMs);

      const stopPostCreateRenderTiming = catchTrace.startTiming('post_create_render_ms');

      const normalizedCatchRecord: CatchRecord = {
        id: catchResult.catchId,
        caught_at: new Date().toISOString(),
        catch_number: catchResult.catchNumber,
        status: catchResult.status,
      };
      const normalizedFursuit: FursuitDetails = {
        id: catchResult.fursuitId ?? catchResult.catchId,
        name: catchResult.fursuitName ?? `Code ${normalizedCode}`,
        species: catchResult.fursuitSpeciesName ?? null,
        species_id: catchResult.fursuitSpeciesId ?? null,
        avatar_path: catchResult.fursuitAvatarPath ?? null,
        avatar_url: resolveStorageMediaUrl({
          bucket: FURSUIT_BUCKET,
          path: catchResult.fursuitAvatarPath ?? null,
          legacyUrl: catchResult.fursuitAvatarUrl ?? null,
        }),
        unique_code: normalizedCode,
        catch_count: catchResult.requiresApproval ? 0 : (catchResult.catchNumber ?? 1),
        owner_id: catchResult.fursuitOwnerId,
        created_at: null,
        bio: null,
        colors: [],
        makers: [],
        is_tutorial: false,
      };

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
      setConversationPrompt(null);
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
      setSelectedReciprocalFursuitId(null);

      // Events are now fired by the Edge Function, no need to emit here
    } catch (caught) {
      const caughtWithTiming = caught as {
        catchPerformanceResult?: 'failed' | 'timeout';
        edgeRequestMs?: number | null;
      };
      catchTrace.recordTiming('edge_request_ms', caughtWithTiming.edgeRequestMs);
      finishCatchTrace({
        result: caughtWithTiming.catchPerformanceResult ?? 'failed',
        errorCode: caughtWithTiming.catchPerformanceResult === 'timeout' ? 'edge_timeout' : 'error',
      });
      resetCatchState();

      const fallbackMessage =
        caught instanceof Error ? caught.message : "We couldn't save that catch. Please try again.";
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

  const caughtAtLabel = catchRecord
    ? (toDisplayDateTime(catchRecord.caught_at) ?? 'Caught just now')
    : null;
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

  const handlePhotoCatch = async (params: {
    fursuitId: string;
    conventionId: string | null;
    catchResult: CreateCatchResult;
  }) => {
    if (!userId) return;

    setIsPhotoSubmitting(true);
    setPhotoSubmitError(null);
    resetCatchState();

    try {
      const client = supabase as any;

      // Fetch fursuit details for the result card
      const { data: fursuit, error: fursuitError } = await client
        .from('fursuits')
        .select(
          `
          id,
          name,
          species_id,
          avatar_path,
          avatar_url,
          is_tutorial,
          unique_code,
          catch_count,
          owner_id,
          created_at,
          species_entry:fursuit_species (
            id,
            name,
            normalized_name
          ),
          color_assignments:fursuit_color_assignments (
            position,
            color:fursuit_colors (
              id,
              name,
              normalized_name
            )
          ),
          fursuit_bios (
            version,
            owner_name,
            photo_credit,
            pronouns,
            likes_and_interests,
            ask_me_about,
            social_links,
            created_at,
            updated_at
          ),
          owner_profile:profiles!fursuits_owner_id_fkey (
            social_links
          )
        `,
        )
        .eq('id', params.fursuitId)
        .eq('is_tutorial', false)
        .maybeSingle();

      if (fursuitError) throw fursuitError;
      if (!fursuit) {
        setPhotoSubmitError('Fursuit unavailable');
        return;
      }

      const makersByFursuitId = await fetchFursuitMakersByFursuitIds([fursuit.id]);

      const normalizedFursuit: FursuitDetails = {
        id: fursuit.id,
        name: fursuit.name,
        species: (fursuit as any)?.species_entry?.name ?? null,
        species_id: (fursuit as any)?.species_entry?.id ?? fursuit.species_id ?? null,
        avatar_path: (fursuit as any)?.avatar_path ?? null,
        avatar_url: resolveStorageMediaUrl({
          bucket: FURSUIT_BUCKET,
          path: (fursuit as any)?.avatar_path ?? null,
          legacyUrl: fursuit.avatar_url ?? null,
        }),
        unique_code: fursuit.unique_code ?? null,
        catch_count:
          typeof (fursuit as any)?.catch_count === 'number' ? (fursuit as any).catch_count : 0,
        owner_id: fursuit.owner_id,
        created_at: fursuit.created_at ?? null,
        bio: applyProfileSocialLinksToBio(
          mapLatestFursuitBio((fursuit as any)?.fursuit_bios ?? null),
          parseSocialLinks((fursuit as any)?.owner_profile?.social_links ?? null),
        ),
        colors: mapFursuitColors((fursuit as any)?.color_assignments ?? null),
        makers: makersByFursuitId.get(fursuit.id) ?? [],
        is_tutorial: false,
      };

      addMonitoringBreadcrumb({
        category: 'catch',
        message: 'Photo catch completed',
        data: {
          fursuitId: params.fursuitId,
          conventionId: params.conventionId,
          method: 'photo',
        },
      });

      // catchResult already created by PhotoCatchCard before the upload
      const { catchResult } = params;

      const promptCandidate = normalizedFursuit.bio
        ? [normalizedFursuit.bio.askMeAbout, normalizedFursuit.bio.likesAndInterests]
            .map((v) => v?.trim())
            .find((v) => v)
        : null;
      const displayedCatchCount = catchResult.requiresApproval
        ? normalizedFursuit.catch_count
        : normalizedFursuit.catch_count + 1;

      setCaughtFursuit({
        ...normalizedFursuit,
        catch_count: displayedCatchCount,
      });
      setCatchRecord({
        id: catchResult.catchId,
        caught_at: new Date().toISOString(),
        catch_number: catchResult.catchNumber,
        status: catchResult.status,
      });
      setLastCatchConventionId(params.conventionId);
      setLastCatchConventionIds(params.conventionId ? [params.conventionId] : []);
      setCatchNumber(catchResult.catchNumber);
      setConversationPrompt(promptCandidate ?? null);
      setReciprocalFeedback(reciprocalOfferMessage(catchResult.reciprocalOffer));
      scheduleCatchSurfaceRefresh({
        fursuitId: params.fursuitId,
        conventionIds: params.conventionId ? [params.conventionId] : [],
        catchResult,
      });
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error ? caught.message : "We couldn't save that catch. Please try again.";
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

  return (
    <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Tag Fursuits Here</Text>
        <Text style={styles.title}>Log a new catch</Text>
        <Text style={styles.subtitle}>
          Enter a fursuit's catch code to add them to your collection.
        </Text>
      </View>

      <CatchOutboxList
        items={outboxItems}
        compact
        onRetry={retryOutboxItem}
        onDismiss={dismissOutboxItem}
        onEditCode={handleEditOutboxCode}
      />

      {!caughtFursuit && userId ? (
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
              disabled={!hasActiveConvention || Boolean(verificationRequiredConvention)}
              submitError={photoSubmitError}
              activeConventionIds={activeConventionIds}
              preloadedFursuits={pickerItems}
              isRosterRefreshing={isRosterRefreshing || (isUsingRosterSnapshot && isRosterLoading)}
            />
          ) : null}
        </View>
      ) : null}

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
            Letters or numbers, {codeInput.length}/{UNIQUE_CODE_LENGTH} characters.
          </Text>
          <Text style={[styles.helpText, { marginTop: spacing.xs }]}>
            Some owners require manual approval. If so, they will be notified and your catch will
            count once approved.
          </Text>
        </View>

        <ReciprocalCatchSelector
          items={codeReciprocalFursuits}
          selectedId={selectedReciprocalFursuitId}
          onSelect={(id) => {
            setSelectedReciprocalFursuitId(id);
            setSubmitError(null);
          }}
          disabled={isSubmitting || isLifecycleCatchBlocked}
        />

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
            {isPending
              ? 'In the meantime, check out their bio below and start a conversation!'
              : `You just tagged ${caughtFursuit.name}. Scroll through their bio below and start a conversation!`}
          </Text>
          {reciprocalFeedback ? (
            <Text style={[styles.sectionBody, styles.sectionHighlight]}>{reciprocalFeedback}</Text>
          ) : null}
          {conversationPrompt ? (
            <TailTagCard style={isPending ? styles.pendingPromptCard : styles.promptCard}>
              <Text style={isPending ? styles.pendingPromptLabel : styles.promptLabel}>
                Ask them about…
              </Text>
              <Text style={styles.promptBody}>{conversationPrompt}</Text>
            </TailTagCard>
          ) : null}
          <View style={isPending ? styles.pendingCardBorder : undefined}>
            <FursuitCard
              name={caughtFursuit.name}
              species={caughtFursuit.species}
              colors={caughtFursuit.colors}
              avatarUrl={caughtFursuit.avatar_url}
              uniqueCode={caughtFursuit.unique_code}
              timelineLabel={caughtAtLabel ?? undefined}
              onPress={() =>
                router.push({
                  pathname: '/fursuits/[id]',
                  params: { id: caughtFursuit.id },
                })
              }
              onCodeCopied={handleCatchCodeCopied}
            />
          </View>
          {fursuitBioHasDisplayableContent(caughtFursuit.bio, caughtFursuit.makers) ? (
            <View style={styles.bioSpacing}>
              <TailTagCard>
                <FursuitBioDetails
                  bio={caughtFursuit.bio}
                  makers={caughtFursuit.makers}
                />
              </TailTagCard>
            </View>
          ) : null}
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
