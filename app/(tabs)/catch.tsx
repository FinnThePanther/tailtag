import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import {
  FursuitCard,
  FursuitBioDetails,
  fursuitBioHasDisplayableContent,
  CAUGHT_SUITS_QUERY_KEY,
  mapLatestFursuitBio,
  mapFursuitColors,
  fursuitDetailQueryKey,
} from '../../src/features/suits';
import type { FursuitBio } from '../../src/features/suits';
import {
  CONVENTION_LEADERBOARD_QUERY_KEY,
  CONVENTION_SUIT_LEADERBOARD_QUERY_KEY,
} from '../../src/features/leaderboard';
import {
  createCatch,
  myPendingCatchesQueryKey,
  pendingCatchesQueryKey,
  PhotoCatchCard,
  type CatchStatus,
  type CreateCatchResult,
} from '../../src/features/catch-confirmations';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { KeyboardAwareFormWrapper } from '../../src/components/ui/KeyboardAwareFormWrapper';
import { useAuth } from '../../src/features/auth';
import { fetchActiveSharedConventionIds } from '../../src/features/conventions';
import { emitGameplayEvent } from '../../src/features/events';
import { DAILY_TASKS_QUERY_KEY } from '../../src/features/daily-tasks/hooks';
import { achievementsStatusQueryKey } from '../../src/features/achievements';
import { supabase } from '../../src/lib/supabase';
import { captureHandledException, addMonitoringBreadcrumb } from '../../src/lib/sentry';
import { spacing } from '../../src/theme';
import { useBlockedIds } from '../../src/features/moderation';
import { normalizeUniqueCodeInput } from '../../src/utils/code';
import { toDisplayDateTime } from '../../src/utils/dates';
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
};

type CatchRecord = {
  id: string;
  caught_at: string | null;
  catch_number: number | null;
  status: CatchStatus;
};

export default function CatchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();

  const blockedIds = useBlockedIds(userId);

  const [codeInput, setCodeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPhotoSubmitting, setIsPhotoSubmitting] = useState(false);
  const [photoSubmitError, setPhotoSubmitError] = useState<string | null>(null);
  const [caughtFursuit, setCaughtFursuit] = useState<FursuitDetails | null>(null);
  const [catchRecord, setCatchRecord] = useState<CatchRecord | null>(null);
  const [catchNumber, setCatchNumber] = useState<number | null>(null);
  const [conversationPrompt, setConversationPrompt] = useState<string | null>(null);
  const [lastCatchConventionId, setLastCatchConventionId] = useState<string | null>(null);
  const [lastCatchConventionIds, setLastCatchConventionIds] = useState<string[]>([]);

  const resetCatchState = () => {
    setCaughtFursuit(null);
    setCatchRecord(null);
    setCatchNumber(null);
    setConversationPrompt(null);
    setLastCatchConventionId(null);
    setLastCatchConventionIds([]);
  };

  // Clear caught fursuit state when user navigates away
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Cleanup on blur (when navigating away)
        resetCatchState();
        setSubmitError(null);
      };
    }, []),
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

  const handleSubmit = async () => {
    if (!userId || isSubmitting) {
      return;
    }

    const normalizedCode = normalizeUniqueCodeInput(codeInput);

    if (!normalizedCode) {
      setSubmitError('Enter the code from the fursuit badge to record your catch.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    resetCatchState();

    try {
      const client = supabase as any;

      // Fetch fursuit details by code
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
            pronouns,
            likes_and_interests,
            ask_me_about,
            social_links,
            created_at,
            updated_at
          )
        `,
        )
        .eq('unique_code', normalizedCode)
        .order('version', { ascending: false, foreignTable: 'fursuit_bios' })
        .limit(1, { foreignTable: 'fursuit_bios' })
        .eq('is_tutorial', false)
        .maybeSingle();

      if (fursuitError) {
        throw fursuitError;
      }

      if (!fursuit) {
        resetCatchState();
        setSubmitError(
          "We couldn't find a fursuit with that code. Double-check the letters and try again.",
        );
        return;
      }

      const initialCatchCount =
        typeof (fursuit as any)?.catch_count === 'number' ? (fursuit as any).catch_count : 0;

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
        catch_count: initialCatchCount,
        owner_id: fursuit.owner_id,
        created_at: fursuit.created_at ?? null,
        bio: mapLatestFursuitBio((fursuit as any)?.fursuit_bios ?? null),
        colors: mapFursuitColors((fursuit as any)?.color_assignments ?? null),
        is_tutorial: fursuit.is_tutorial === true,
      };

      if (normalizedFursuit.is_tutorial) {
        resetCatchState();
        setSubmitError('Tutorial suits cannot be caught by scanning codes.');
        return;
      }

      if (blockedIds.has(normalizedFursuit.owner_id)) {
        resetCatchState();
        setSubmitError('You cannot catch this fursuit.');
        return;
      }

      const sharedConventions = await fetchActiveSharedConventionIds(userId, normalizedFursuit.id);

      if (sharedConventions.length === 0) {
        resetCatchState();
        setSubmitError(
          "You and this fursuit aren't at the same live convention. Check Settings → Conventions and make sure you're both joined to the same live event.",
        );
        return;
      }

      const primaryConventionId = sharedConventions[0] ?? null;

      // Use the Edge Function to create the catch
      // This handles approval mode logic server-side
      addMonitoringBreadcrumb({
        category: 'catch',
        message: 'Catch initiated',
        data: {
          fursuitId: normalizedFursuit.id,
          conventionId: primaryConventionId,
          method: 'manual',
        },
      });
      const catchResult = await createCatch({
        fursuitId: normalizedFursuit.id,
        conventionId: primaryConventionId,
        isTutorial: Boolean(normalizedFursuit.is_tutorial),
      });

      const promptCandidate = normalizedFursuit.bio
        ? [normalizedFursuit.bio.askMeAbout, normalizedFursuit.bio.likesAndInterests]
            .map((value) => value?.trim())
            .find((value) => value)
        : null;

      const minimumCatchCount = initialCatchCount + 1;
      let latestCatchCount = minimumCatchCount;

      // Only try to get updated catch count for accepted catches
      if (!catchResult.requiresApproval) {
        try {
          const { data: latestFursuit, error: latestCatchError } = await client
            .from('fursuits')
            .select('catch_count')
            .eq('id', normalizedFursuit.id)
            .maybeSingle();

          if (latestCatchError) {
            throw latestCatchError;
          }

          if (latestFursuit && typeof latestFursuit.catch_count === 'number') {
            latestCatchCount = Math.max(latestFursuit.catch_count, minimumCatchCount);
          }
        } catch (countError) {
          console.warn('Failed to refresh catch count', countError);
        }
      }

      const normalizedCatchRecord: CatchRecord = {
        id: catchResult.catchId,
        caught_at: new Date().toISOString(),
        catch_number: catchResult.catchNumber,
        status: catchResult.status,
      };

      setCaughtFursuit({
        ...normalizedFursuit,
        catch_count: latestCatchCount,
      });
      setCatchRecord(normalizedCatchRecord);
      setLastCatchConventionId(primaryConventionId);
      setLastCatchConventionIds(sharedConventions);
      setCatchNumber(normalizedCatchRecord.catch_number ?? latestCatchCount);
      setConversationPrompt(promptCandidate ?? null);

      // Invalidate queries
      void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: fursuitDetailQueryKey(normalizedFursuit.id),
      });
      sharedConventions.forEach((conventionId) => {
        queryClient.invalidateQueries({
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
        });
        queryClient.invalidateQueries({
          queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, conventionId],
        });
      });
      queryClient.invalidateQueries({
        queryKey: [CAUGHT_SUITS_QUERY_KEY, userId],
      });
      void queryClient.invalidateQueries({
        queryKey: achievementsStatusQueryKey(userId),
      });

      // Invalidate pending catches for the fursuit owner (if it's a pending catch)
      if (catchResult.requiresApproval && catchResult.fursuitOwnerId) {
        queryClient.invalidateQueries({
          queryKey: pendingCatchesQueryKey(catchResult.fursuitOwnerId),
        });
      }

      // Invalidate my pending catches so the Caught tab list updates
      if (catchResult.status === 'PENDING') {
        queryClient.invalidateQueries({
          queryKey: myPendingCatchesQueryKey(userId),
        });
      }

      setCodeInput('');

      // Events are now fired by the Edge Function, no need to emit here
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error ? caught.message : "We couldn't save that catch. Please try again.";
      setSubmitError(fallbackMessage);
      resetCatchState();

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

  const handleCatchAnother = () => {
    resetCatchState();
    setSubmitError(null);
    setCodeInput('');
  };

  const handlePhotoCatch = async (params: {
    fursuitId: string;
    conventionId: string | null;
    photoUrl: string;
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
            pronouns,
            likes_and_interests,
            ask_me_about,
            social_links,
            created_at,
            updated_at
          )
        `,
        )
        .eq('id', params.fursuitId)
        .eq('is_tutorial', false)
        .maybeSingle();

      if (fursuitError) throw fursuitError;
      if (!fursuit) {
        setPhotoSubmitError("Couldn't load fursuit details. Please try again.");
        return;
      }

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
        bio: mapLatestFursuitBio((fursuit as any)?.fursuit_bios ?? null),
        colors: mapFursuitColors((fursuit as any)?.color_assignments ?? null),
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

      setCaughtFursuit({
        ...normalizedFursuit,
        catch_count: normalizedFursuit.catch_count + 1,
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

      void queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: fursuitDetailQueryKey(params.fursuitId),
      });
      if (params.conventionId) {
        queryClient.invalidateQueries({
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, params.conventionId],
        });
        queryClient.invalidateQueries({
          queryKey: [CONVENTION_SUIT_LEADERBOARD_QUERY_KEY, params.conventionId],
        });
      }
      queryClient.invalidateQueries({
        queryKey: [CAUGHT_SUITS_QUERY_KEY, userId],
      });
      void queryClient.invalidateQueries({
        queryKey: achievementsStatusQueryKey(userId),
      });

      if (catchResult.requiresApproval && catchResult.fursuitOwnerId) {
        queryClient.invalidateQueries({
          queryKey: pendingCatchesQueryKey(catchResult.fursuitOwnerId),
        });
      }

      if (catchResult.status === 'PENDING') {
        queryClient.invalidateQueries({
          queryKey: myPendingCatchesQueryKey(userId),
        });
      }
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

      {!caughtFursuit && userId ? (
        <View style={styles.photoCatchSpacing}>
          <PhotoCatchCard
            userId={userId}
            onCatchSubmit={handlePhotoCatch}
            isSubmitting={isPhotoSubmitting}
            submitError={photoSubmitError}
          />
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
            placeholder="ABCDEFGH"
            autoCapitalize="characters"
            maxLength={8}
            editable={!isSubmitting}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            style={styles.codeInput}
          />
          <Text style={styles.helpText}>Letters only, {codeInput.length}/8 characters.</Text>
          <Text style={[styles.helpText, { marginTop: spacing.xs }]}>
            Some fursuits require manual approval. If so, the owner will be notified and your catch
            will count once approved.
          </Text>
        </View>

        {submitError ? (
          <View style={styles.errorContainer}>
            <Ionicons
              name="alert-circle"
              size={18}
              color="#f87171"
            />
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        ) : null}

        <TailTagButton
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={!userId || isSubmitting}
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
          {caughtFursuit.bio && fursuitBioHasDisplayableContent(caughtFursuit.bio) ? (
            <View style={styles.bioSpacing}>
              <TailTagCard>
                <FursuitBioDetails bio={caughtFursuit.bio} />
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
    </KeyboardAwareFormWrapper>
  );
}
