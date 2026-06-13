import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import {
  ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY,
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  createJoinableConventionsQueryOptions,
  fetchProfileConventionMemberships,
  optInToConvention,
  optOutOfConvention,
  type ConventionMembership,
  type ConventionMembershipState,
  type ConventionSummary,
  type VerifiedLocation,
  useConventionVerificationAction,
} from '../../conventions';
import { ConventionToggle } from '../../../components/conventions/ConventionToggle';
import { CONVENTION_LEADERBOARD_QUERY_KEY } from '../../leaderboard/api/leaderboard';
import { formatConventionDateRange } from '../../conventions/utils';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';
import { styles } from './ConventionStep.styles';

type ConventionStepProps = {
  userId: string;
  onComplete: (conventionIds: string[]) => void;
  onSkip: () => void;
};

function conventionBadgeText(
  convention: ConventionSummary,
  selected: boolean,
  membershipState?: ConventionMembershipState | null,
) {
  if (!selected) {
    return 'Attend';
  }

  if (membershipState === 'active') {
    return 'Ready to catch';
  }

  if (membershipState === 'leaderboard_open') {
    return 'Standings open';
  }

  if (membershipState === 'needs_location_verification') {
    return 'Verify location';
  }

  if (membershipState === 'awaiting_start') {
    return 'Waiting for staff start';
  }

  if (membershipState === 'upcoming') {
    const startsAt = formatConventionDateRange(convention.start_date ?? null, null);
    return startsAt ? `Starts ${startsAt}` : 'Attending';
  }

  return 'Attending';
}

export function ConventionStep({ userId, onComplete, onSkip }: ConventionStepProps) {
  const queryClient = useQueryClient();
  const hasInitializedSelectionsRef = useRef(false);
  const [searchInput, setSearchInput] = useState('');
  const [selectedConventionIds, setSelectedConventionIds] = useState<Set<string>>(new Set());
  const [committedConventionIds, setCommittedConventionIds] = useState<Set<string>>(new Set());
  const [verifiedLocations, setVerifiedLocations] = useState<Record<string, VerifiedLocation>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const conventionsQueryOptions = useMemo(() => createJoinableConventionsQueryOptions(), []);
  const {
    data: conventions = [],
    error,
    isLoading,
    refetch,
  } = useQuery<ConventionSummary[], Error>({
    ...conventionsQueryOptions,
    refetchOnMount: true,
  });

  // Fetch user's existing conventions to handle onboarding restarts
  const { data: existingMemberships = [], isLoading: isLoadingExisting } = useQuery<
    ConventionMembership[],
    Error
  >({
    queryKey: [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, userId],
    queryFn: fetchProfileConventionMemberships,
    staleTime: 0, // Always fetch fresh data during onboarding
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Don't refetch while user is editing selections
    refetchOnReconnect: false, // Don't refetch on reconnect to avoid overwriting edits
  });
  const existingConventionIds = useMemo(
    () => existingMemberships.map((membership) => membership.convention_id),
    [existingMemberships],
  );
  const membershipByConventionId = useMemo(
    () => new Map(existingMemberships.map((membership) => [membership.convention_id, membership])),
    [existingMemberships],
  );
  const handleVerifiedConvention = useCallback(
    (convention: ConventionSummary, payload: { verifiedLocation: VerifiedLocation }) => {
      hasInitializedSelectionsRef.current = true;
      setSelectedConventionIds((current) => new Set([...current, convention.id]));
      setCommittedConventionIds((current) => new Set([...current, convention.id]));
      setVerifiedLocations((current) => ({
        ...current,
        [convention.id]: payload.verifiedLocation,
      }));
    },
    [],
  );
  const { verifyConvention, verificationModals, isVerifyingConvention } =
    useConventionVerificationAction({
      profileId: userId,
      onVerified: handleVerifiedConvention,
    });

  // Pre-populate selected conventions with existing ones on initial load only
  // This ensures we don't overwrite user's in-progress edits if the query refetches
  useEffect(() => {
    if (
      !isLoadingExisting &&
      existingConventionIds.length > 0 &&
      !hasInitializedSelectionsRef.current
    ) {
      setSelectedConventionIds(new Set(existingConventionIds));
      hasInitializedSelectionsRef.current = true;
    }
  }, [isLoadingExisting, existingConventionIds]);

  const filteredConventions = useMemo(() => {
    if (searchInput.trim().length === 0) {
      return conventions;
    }

    const normalized = searchInput.trim().toLowerCase();
    return conventions.filter((convention) => {
      const haystack = `${convention.name} ${convention.location ?? ''}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [conventions, searchInput]);

  const toggleConvention = (
    conventionId: string,
    nextSelected: boolean,
    verifiedLocation?: VerifiedLocation | null,
  ) => {
    hasInitializedSelectionsRef.current = true;
    setSelectedConventionIds((current) =>
      nextSelected
        ? new Set([...current, conventionId])
        : (() => {
            const next = new Set(current);
            next.delete(conventionId);
            return next;
          })(),
    );

    setVerifiedLocations((current) => {
      if (nextSelected) {
        const next = { ...current };
        if (verifiedLocation) {
          next[conventionId] = verifiedLocation;
        }
        return next;
      }

      const next = { ...current };
      delete next[conventionId];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedConventionIds.size === 0 || isSubmitting) {
      setSubmitError('Select a convention to continue.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const selections = [...selectedConventionIds];
      const existing = Array.from(new Set([...existingConventionIds, ...committedConventionIds]));

      // Calculate delta: what to add and what to remove
      const toAdd = selections.filter((id) => !existing.includes(id));
      const toRemove = existing.filter((id) => !selections.includes(id));
      const successfulOptIns: string[] = [];
      const successfulOptOuts: string[] = [];
      const affectedConventionIds = Array.from(new Set([...toAdd, ...toRemove]));

      try {
        for (const conventionId of toAdd) {
          await optInToConvention({
            profileId: userId,
            conventionId,
            verifiedLocation: verifiedLocations[conventionId],
          });
          successfulOptIns.push(conventionId);
        }

        for (const conventionId of toRemove) {
          await optOutOfConvention(userId, conventionId);
          successfulOptOuts.push(conventionId);
        }
      } catch (operationError) {
        await Promise.allSettled([
          ...successfulOptIns.map((conventionId) => optOutOfConvention(userId, conventionId)),
          ...successfulOptOuts.map((conventionId) =>
            optInToConvention({
              profileId: userId,
              conventionId,
              verifiedLocation: verifiedLocations[conventionId],
            }),
          ),
        ]);

        throw operationError;
      }

      void queryClient.invalidateQueries({
        queryKey: [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, userId],
      });
      void queryClient.invalidateQueries({
        queryKey: [ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY, userId],
      });
      setCommittedConventionIds(new Set());

      // Invalidate leaderboard cache for joined conventions
      affectedConventionIds.forEach((conventionId) => {
        void queryClient.invalidateQueries({
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
        });
      });

      onComplete(selections);
      if (toAdd.length > 0) {
        const addedConventionNames = toAdd
          .map((conventionId) => conventions.find((convention) => convention.id === conventionId))
          .filter((convention): convention is ConventionSummary => Boolean(convention))
          .map((convention) => convention.name);
        const target =
          addedConventionNames.length === 1 ? addedConventionNames[0] : 'your conventions';
        Alert.alert(
          'Your suits will be listed by default',
          `TailTag now adds every suit in your account to ${target}. If a suit is not catchable there, open My Suits later and remove that convention from the suit.`,
          [{ text: 'Got it' }],
        );
      }
    } catch (caught) {
      void queryClient.invalidateQueries({
        queryKey: [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, userId],
      });
      void queryClient.invalidateQueries({
        queryKey: [ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY, userId],
      });
      [...selectedConventionIds, ...existingConventionIds].forEach((conventionId) => {
        void queryClient.invalidateQueries({
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
        });
      });

      setSubmitError(
        getUserVisibleErrorMessage(
          caught,
          'We could not save your convention selection. Please try again.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <TailTagCard>
        <Text style={styles.eyebrow}>Step 2</Text>
        <Text style={styles.title}>Choose your conventions</Text>
        <Text style={styles.body}>
          Add the conventions you're attending so TailTag is ready when they go live. You can update
          these anytime in Settings.
        </Text>

        <TailTagInput
          placeholder="Search conventions"
          value={searchInput}
          onChangeText={setSearchInput}
          editable={!isLoading && !isLoadingExisting && !isSubmitting}
          style={styles.search}
        />

        <View style={styles.listHeader}>
          <Text style={styles.listHeaderText}>Available conventions</Text>
          <TailTagButton
            size="sm"
            variant="outline"
            onPress={() => refetch()}
            disabled={isLoading || isLoadingExisting}
          >
            Refresh
          </TailTagButton>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
          scrollEnabled
        >
          {isLoading || isLoadingExisting ? (
            <Text style={styles.message}>Loading conventions…</Text>
          ) : error ? (
            <Text style={styles.error}>
              {getUserVisibleErrorMessage(error, 'We could not load conventions.')}
            </Text>
          ) : filteredConventions.length === 0 ? (
            <Text style={styles.message}>
              {conventions.length === 0
                ? 'No conventions are open for joining right now.'
                : 'No conventions matched your search yet.'}
            </Text>
          ) : (
            filteredConventions.map((convention) => {
              const selected = selectedConventionIds.has(convention.id);
              const membership = membershipByConventionId.get(convention.id);
              return (
                <View
                  key={convention.id}
                  style={styles.listItem}
                >
                  <ConventionToggle
                    convention={convention}
                    selected={selected}
                    pending={isSubmitting}
                    disabled={isSubmitting || isVerifyingConvention}
                    badgeText={conventionBadgeText(
                      convention,
                      selected,
                      membership?.membership_state,
                    )}
                    membershipState={membership?.membership_state}
                    profileId={userId}
                    onVerifyLocation={verifyConvention}
                    onToggle={(conventionId, nextSelected, verifiedLocation) =>
                      toggleConvention(conventionId, nextSelected, verifiedLocation)
                    }
                  />
                </View>
              );
            })
          )}
        </ScrollView>

        {verificationModals}

        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

        <TailTagButton
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting || isVerifyingConvention}
        >
          Continue
        </TailTagButton>
        <TailTagButton
          variant="ghost"
          onPress={onSkip}
          disabled={isSubmitting || isVerifyingConvention}
        >
          Skip for now
        </TailTagButton>
      </TailTagCard>
    </View>
  );
}
