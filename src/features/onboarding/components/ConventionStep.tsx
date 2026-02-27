import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { TailTagButton } from "../../../components/ui/TailTagButton";
import { TailTagCard } from "../../../components/ui/TailTagCard";
import { TailTagInput } from "../../../components/ui/TailTagInput";
import {
  createConventionsQueryOptions,
  fetchProfileConventionIds,
  optInToConvention,
  optOutOfConvention,
  PROFILE_CONVENTIONS_QUERY_KEY,
  type ConventionSummary,
  type VerifiedLocation,
} from "../../conventions";
import { ConventionToggle } from "../../../components/conventions/ConventionToggle";
import { colors, spacing } from "../../../theme";
import { CONVENTION_LEADERBOARD_QUERY_KEY } from "../../leaderboard/api/leaderboard";

type ConventionStepProps = {
  userId: string;
  onComplete: (conventionIds: string[]) => void;
};

export function ConventionStep({ userId, onComplete }: ConventionStepProps) {
  const queryClient = useQueryClient();
  const hasInitializedSelectionsRef = useRef(false);
  const [searchInput, setSearchInput] = useState("");
  const [selectedConventionIds, setSelectedConventionIds] = useState<
    Set<string>
  >(new Set());
  const [verifiedLocations, setVerifiedLocations] = useState<
    Record<string, VerifiedLocation>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const conventionsQueryOptions = useMemo(
    () => createConventionsQueryOptions(),
    [],
  );
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
  const { data: existingConventionIds = [], isLoading: isLoadingExisting } =
    useQuery<string[], Error>({
      queryKey: [PROFILE_CONVENTIONS_QUERY_KEY, userId],
      queryFn: () => fetchProfileConventionIds(userId),
      staleTime: 0, // Always fetch fresh data during onboarding
      refetchOnMount: true,
      refetchOnWindowFocus: false, // Don't refetch while user is editing selections
      refetchOnReconnect: false, // Don't refetch on reconnect to avoid overwriting edits
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
      const haystack =
        `${convention.name} ${convention.location ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [conventions, searchInput]);

  const toggleConvention = (
    conventionId: string,
    nextSelected: boolean,
    verifiedLocation?: VerifiedLocation | null,
  ) => {
    setSelectedConventionIds((current) => {
      const next = new Set(current);
      if (nextSelected) {
        next.add(conventionId);
      } else {
        next.delete(conventionId);
      }
      return next;
    });

    setVerifiedLocations((current) => {
      const next = { ...current };
      if (nextSelected && verifiedLocation) {
        next[conventionId] = verifiedLocation;
      } else if (!nextSelected && next[conventionId]) {
        delete next[conventionId];
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedConventionIds.size === 0 || isSubmitting) {
      setSubmitError("Select at least one convention to continue.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const selections = [...selectedConventionIds];
      const existing = existingConventionIds;

      // Calculate delta: what to add and what to remove
      const toAdd = selections.filter((id) => !existing.includes(id));
      const toRemove = existing.filter((id) => !selections.includes(id));

      // Only make API calls if there are changes
      const operations: Promise<void>[] = [];

      toAdd.forEach((conventionId) => {
        operations.push(
          optInToConvention({
            profileId: userId,
            conventionId,
            verifiedLocation: verifiedLocations[conventionId],
          }),
        );
      });

      toRemove.forEach((conventionId) => {
        operations.push(optOutOfConvention(userId, conventionId));
      });

      // Execute all operations in parallel (if any)
      if (operations.length > 0) {
        await Promise.all(operations);
      }

      // Optimistically update cache with final state
      queryClient.setQueryData<string[] | undefined>(
        [PROFILE_CONVENTIONS_QUERY_KEY, userId],
        selections,
      );

      // Invalidate leaderboard cache for joined conventions
      toAdd.forEach((conventionId) => {
        void queryClient.invalidateQueries({
          queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId],
        });
      });

      onComplete(selections);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "We could not save your convention picks. Please try again.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <TailTagCard>
        <Text style={styles.eyebrow}>Step 2</Text>
        <Text style={styles.title}>Choose your first convention</Text>
        <Text style={styles.body}>
          Pick the current convention you're attending to find other fursuiters!
        </Text>

        <TailTagInput
          placeholder="Search conventions"
          value={searchInput}
          onChangeText={setSearchInput}
          editable={!isLoading && !isLoadingExisting && !isSubmitting}
          style={styles.search}
        />

        <View style={styles.listHeader}>
          <Text style={styles.listHeaderText}>Active conventions</Text>
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
            <Text style={styles.error}>{error.message}</Text>
          ) : filteredConventions.length === 0 ? (
            <Text style={styles.message}>
              No conventions matched your search yet.
            </Text>
          ) : (
            filteredConventions.map((convention) => {
              const selected = selectedConventionIds.has(convention.id);
              return (
                <View key={convention.id} style={styles.listItem}>
                  <ConventionToggle
                    convention={convention}
                    selected={selected}
                    pending={isSubmitting}
                    disabled={isSubmitting}
                    profileId={userId}
                    onToggle={(conventionId, nextSelected, verifiedLocation) =>
                      toggleConvention(
                        conventionId,
                        nextSelected,
                        verifiedLocation,
                      )
                    }
                  />
                </View>
              );
            })
          )}
        </ScrollView>

        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

        <TailTagButton
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          Continue
        </TailTagButton>
      </TailTagCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  body: {
    color: "rgba(226,232,240,0.85)",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  search: {
    marginBottom: spacing.md,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  listHeaderText: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  list: {
    maxHeight: 320,
    marginBottom: spacing.md,
  },
  listContent: {
    gap: spacing.sm,
  },
  listItem: {
    marginBottom: spacing.sm,
  },
  message: {
    color: "rgba(148,163,184,0.85)",
    fontSize: 15,
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
});
