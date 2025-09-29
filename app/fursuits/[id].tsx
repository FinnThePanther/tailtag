import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import {
  FursuitCard,
  FursuitBioDetails,
  fetchFursuitDetail,
  fursuitDetailQueryKey,
} from '../../src/features/suits';
import { useAuth } from '../../src/features/auth';
import { colors, spacing } from '../../src/theme';

const formatDate = (isoTimestamp: string | null) => {
  if (!isoTimestamp) {
    return null;
  }

  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export default function FursuitDetailScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const fursuitId = typeof params.id === 'string' ? params.id : null;

  const {
    data: detail,
    isLoading,
    error,
    refetch,
  } = useQuery({
    enabled: Boolean(fursuitId),
    queryKey: fursuitDetailQueryKey(fursuitId ?? ''),
    queryFn: () => fetchFursuitDetail(fursuitId ?? ''),
    staleTime: 2 * 60_000,
  });

  const isOwner = useMemo(() => {
    if (!detail || !userId) {
      return false;
    }

    return detail.owner_id === userId;
  }, [detail, userId]);

  const handleEditBio = () => {
    if (!fursuitId) {
      return;
    }

    router.push({ pathname: '/fursuits/[id]/edit', params: { id: fursuitId } });
  };

  const handleGoBack = () => {
    router.back();
  };

  const addedDate = detail ? formatDate(detail.created_at) : null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <TailTagButton variant="ghost" onPress={handleGoBack}>
          Back
        </TailTagButton>
        {isOwner ? (
          <TailTagButton variant="outline" onPress={handleEditBio}>
            Edit bio
          </TailTagButton>
        ) : null}
      </View>

      <TailTagCard>
        {isLoading ? (
          <Text style={styles.message}>Loading that fursuit…</Text>
        ) : error ? (
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>{
              error instanceof Error ? error.message : 'We could not load that fursuit.'
            }</Text>
            <TailTagButton variant="outline" size="sm" onPress={() => refetch()}>
              Try again
            </TailTagButton>
          </View>
        ) : !detail ? (
          <Text style={styles.message}>That fursuit could not be found.</Text>
        ) : (
          <View style={styles.detailStack}>
            <FursuitCard
              name={detail.name}
              species={detail.species}
              avatarUrl={detail.avatar_url}
              uniqueCode={detail.unique_code}
              timelineLabel={addedDate ? `Added on ${addedDate}` : null}
            />
            {detail.bio ? (
              <FursuitBioDetails bio={detail.bio} />
            ) : (
              <Text style={styles.message}>This fursuit does not have a bio yet.</Text>
            )}
            {detail.conventions.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Convention appearances</Text>
                {detail.conventions.map((convention) => {
                  const dateRange = formatDate(convention.start_date);

                  return (
                    <Text key={convention.id} style={styles.sectionItem}>
                      {convention.name}
                      {dateRange ? ` – ${dateRange}` : ''}
                    </Text>
                  );
                })}
              </View>
            ) : null}
            {detail.owner_profile ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Owner profile</Text>
                <Text style={styles.sectionItem}>
                  {detail.owner_profile.username ?? 'No username yet'}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </TailTagCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  errorBlock: {
    gap: spacing.sm,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  detailStack: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionItem: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
});
