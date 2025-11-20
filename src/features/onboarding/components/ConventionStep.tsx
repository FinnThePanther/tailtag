import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { TailTagInput } from '../../../components/ui/TailTagInput';
import {
  createConventionsQueryOptions,
  optInToConvention,
  PROFILE_CONVENTIONS_QUERY_KEY,
  type ConventionSummary,
} from '../../conventions';
import { ConventionToggle } from '../../../components/conventions/ConventionToggle';
import { colors, spacing } from '../../../theme';
import { CONVENTION_LEADERBOARD_QUERY_KEY } from '../../leaderboard/api/leaderboard';

type ConventionStepProps = {
  userId: string;
  onComplete: (conventionIds: string[]) => void;
};

export function ConventionStep({ userId, onComplete }: ConventionStepProps) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [selectedConventionIds, setSelectedConventionIds] = useState<Set<string>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const conventionsQueryOptions = useMemo(() => createConventionsQueryOptions(), []);
  const {
    data: conventions = [],
    error,
    isLoading,
    refetch,
  } = useQuery<ConventionSummary[], Error>({
    ...conventionsQueryOptions,
    refetchOnMount: true,
  });

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

  const toggleConvention = (conventionId: string) => {
    setSelectedConventionIds((current) => {
      const next = new Set(current);
      if (next.has(conventionId)) {
        next.delete(conventionId);
      } else {
        next.add(conventionId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedConventionIds.size === 0 || isSubmitting) {
      setSubmitError('Select at least one convention to continue.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const selections = [...selectedConventionIds];

      await Promise.all(selections.map((conventionId) => optInToConvention(userId, conventionId)));

      queryClient.setQueryData<string[] | undefined>(
        [PROFILE_CONVENTIONS_QUERY_KEY, userId],
        (current = []) => {
          const merged = new Set(current);
          selections.forEach((id) => merged.add(id));
          return [...merged];
        }
      );

      // Invalidate leaderboard cache for all joined conventions
      selections.forEach((conventionId) => {
        void queryClient.invalidateQueries({ queryKey: [CONVENTION_LEADERBOARD_QUERY_KEY, conventionId] });
      });

      onComplete(selections);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'We could not save your convention picks. Please try again.';
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
          Pick at least one convention so other players know where they can find you. You can change
          this later in settings.
        </Text>

        <TailTagInput
          placeholder="Search conventions"
          value={searchInput}
          onChangeText={setSearchInput}
          editable={!isLoading && !isSubmitting}
          style={styles.search}
        />

        <View style={styles.listHeader}>
          <Text style={styles.listHeaderText}>Active conventions</Text>
          <TailTagButton size="sm" variant="outline" onPress={() => refetch()} disabled={isLoading}>
            Refresh
          </TailTagButton>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
          scrollEnabled
        >
          {isLoading ? (
            <Text style={styles.message}>Loading conventions…</Text>
          ) : error ? (
            <Text style={styles.error}>{error.message}</Text>
          ) : filteredConventions.length === 0 ? (
            <Text style={styles.message}>No conventions matched your search yet.</Text>
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
                    onToggle={() => toggleConvention(convention.id)}
                  />
                </View>
              );
            })
          )}
        </ScrollView>

        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

        <TailTagButton onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting}>
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
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  body: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  search: {
    marginBottom: spacing.md,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  listHeaderText: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
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
    color: 'rgba(148,163,184,0.85)',
    fontSize: 15,
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
});
