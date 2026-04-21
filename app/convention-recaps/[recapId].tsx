import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppAvatar } from '../../src/components/ui/AppAvatar';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { useAuth } from '../../src/features/auth';
import {
  createConventionRecapDetailQueryOptions,
  formatConventionDateRange,
  type ConventionRecapCaughtFursuit,
  type ConventionRecapOwnedFursuit,
} from '../../src/features/conventions';
import { useBlockedIds } from '../../src/features/moderation';
import { captureNonCriticalError } from '../../src/lib/sentry';
import { toDisplayDate, toDisplayDateTime } from '../../src/utils/dates';
import { styles } from '../../src/app-styles/convention-recaps/[recapId].styles';

const formatCount = (value: number) => value.toLocaleString();

function formatSeenAt(
  entry: ConventionRecapCaughtFursuit | ConventionRecapOwnedFursuit,
): string | null {
  const lastSeen = 'mostRecentCaughtAt' in entry ? entry.mostRecentCaughtAt : null;
  const firstSeen = 'firstCaughtAt' in entry ? entry.firstCaughtAt : null;
  const timestamp = lastSeen ?? firstSeen;
  const label = toDisplayDateTime(timestamp);
  return label ? `Last seen ${label}` : null;
}

async function openExternalLink(url: string) {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Link unavailable', "We couldn't open that social link on this device.");
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    captureNonCriticalError(error, {
      scope: 'conventionRecaps.openExternalLink',
      url,
    });
    Alert.alert('Link unavailable', "We couldn't open that social link. Try again later.");
  }
}

function RecapStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ConventionRecapDetailScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ recapId?: string }>();
  const recapId = typeof params.recapId === 'string' ? params.recapId : null;

  const blockedIds = useBlockedIds(userId);

  const {
    data: recapDetail,
    isLoading,
    isFetching,
    isSuccess,
    error,
    refetch,
  } = useQuery({
    ...createConventionRecapDetailQueryOptions(userId ?? '', recapId ?? ''),
    enabled: Boolean(userId && recapId),
  });

  const followUpEntries = useMemo(() => {
    if (!recapDetail) {
      return [];
    }

    return recapDetail.caughtFursuits.filter((entry) => {
      if (!entry.ownerId || blockedIds.has(entry.ownerId)) {
        return false;
      }

      const hasFollowUpContent = Boolean(
        entry.ownerName ||
        entry.ownerUsername ||
        entry.pronouns ||
        entry.askMeAbout ||
        entry.likesAndInterests ||
        entry.socialLinks.length > 0,
      );

      return hasFollowUpContent;
    });
  }, [blockedIds, recapDetail]);

  const isBusy = isLoading || (isFetching && !recapDetail);
  const isNotFound = !recapId || (isSuccess && recapDetail === null);

  const headerTitle = recapDetail?.recap.conventionName ?? 'Convention recap';

  if (isBusy) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          title="Convention recap"
          onBack={() => router.back()}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
        >
          <TailTagCard>
            <Text style={styles.message}>Loading recap…</Text>
          </TailTagCard>
          <TailTagCard>
            <Text style={styles.message}>Preparing your catches, awards, and highlights.</Text>
          </TailTagCard>
        </ScrollView>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          title="Convention recap"
          onBack={() => router.back()}
        />
        <View style={styles.centeredContent}>
          <TailTagCard>
            <View style={styles.helperColumn}>
              <Text style={styles.errorText}>{error.message}</Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={() => {
                  void refetch({ throwOnError: false });
                }}
              >
                Try again
              </TailTagButton>
            </View>
          </TailTagCard>
        </View>
      </View>
    );
  }

  if (isNotFound || !recapDetail) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          title="Convention recap"
          onBack={() => router.back()}
        />
        <View style={styles.centeredContent}>
          <TailTagCard>
            <Text style={styles.message}>That recap was not found or is no longer available.</Text>
          </TailTagCard>
        </View>
      </View>
    );
  }

  const { recap, caughtFursuits, ownedFursuits, awards, achievements, dailySummary } = recapDetail;
  const dateRange = formatConventionDateRange(recap.startDate, recap.endDate);
  const heroMeta = [dateRange, recap.location].filter(Boolean).join(' · ');

  const summaryLine = `You caught ${formatCount(
    recap.uniqueFursuitsCaughtCount,
  )} unique fursuits, finished ${formatCount(recap.dailyTasksCompletedCount)} daily tasks, and unlocked ${formatCount(recap.achievementsUnlockedCount)} achievements at ${recap.conventionName}.`;

  const dailySummaryText =
    dailySummary.conventionTotalDays && dailySummary.conventionTotalDays > 0
      ? `Completed ${formatCount(dailySummary.completedTasksCount)} tasks across ${formatCount(
          dailySummary.completedDaysCount,
        )} of ${formatCount(dailySummary.conventionTotalDays)} convention days.`
      : `Completed ${formatCount(dailySummary.completedTasksCount)} tasks across ${formatCount(
          dailySummary.completedDaysCount,
        )} days.`;

  const snapshotStats: { label: string; value: string }[] = [
    { label: 'Final rank', value: recap.finalRank ? `#${formatCount(recap.finalRank)}` : '—' },
    { label: 'Catches', value: formatCount(recap.catchCount) },
    { label: 'Fursuits found', value: formatCount(recap.uniqueFursuitsCaughtCount) },
    { label: 'Achievements', value: formatCount(recap.achievementsUnlockedCount) },
    { label: 'Daily tasks', value: formatCount(recap.dailyTasksCompletedCount) },
  ];

  if (recap.ownFursuitsCaughtCount > 0) {
    snapshotStats.push({
      label: 'Your suits caught',
      value: formatCount(recap.ownFursuitsCaughtCount),
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={headerTitle}
        onBack={() => router.back()}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
      >
        <TailTagCard>
          <View style={styles.heroSection}>
            <Text style={styles.heroEyebrow}>Your recap is ready</Text>
            <Text style={styles.heroTitle}>{recap.conventionName}</Text>
            {heroMeta ? <Text style={styles.heroMeta}>{heroMeta}</Text> : null}
            <View style={styles.heroStatsRow}>
              <Text style={styles.heroPrimaryStat}>{formatCount(recap.catchCount)} catches</Text>
              {recap.finalRank ? (
                <Text style={styles.heroRankBadge}>#{recap.finalRank}</Text>
              ) : null}
            </View>
            <Text style={styles.heroSummary}>{summaryLine}</Text>
          </View>
        </TailTagCard>

        <TailTagCard>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Snapshot stats</Text>
            <View style={styles.statsGrid}>
              {snapshotStats.map((stat) => (
                <RecapStat
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                />
              ))}
            </View>
          </View>
        </TailTagCard>

        <TailTagCard>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fursuits you caught</Text>
            {caughtFursuits.length === 0 ? (
              <Text style={styles.message}>
                You did not log any catches at this convention. Your recap is still here as your
                attendance record.
              </Text>
            ) : (
              <View style={styles.itemList}>
                {caughtFursuits.map((entry) => {
                  const seenAt = formatSeenAt(entry);

                  return (
                    <Pressable
                      key={entry.fursuitId}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${entry.name ?? 'fursuit'} profile`}
                      onPress={() =>
                        router.push({
                          pathname: '/fursuits/[id]',
                          params: { id: entry.fursuitId },
                        })
                      }
                      style={({ pressed }) => [styles.rowCard, pressed && styles.rowCardPressed]}
                    >
                      <AppAvatar
                        url={entry.avatarUrl}
                        size="sm"
                        fallback="fursuit"
                        style={styles.rowAvatar}
                      />
                      <View style={styles.rowBody}>
                        <Text
                          style={styles.rowTitle}
                          numberOfLines={1}
                        >
                          {entry.name ?? 'Unknown fursuit'}
                        </Text>
                        <Text
                          style={styles.rowMeta}
                          numberOfLines={2}
                        >
                          {entry.species ?? 'Species unknown'}
                          {entry.colors.length > 0 ? ` · ${entry.colors.join(', ')}` : ''}
                        </Text>
                        <Text style={styles.rowSubtle}>
                          {formatCount(entry.catchCount)} catches
                          {seenAt ? ` · ${seenAt}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </TailTagCard>

        {followUpEntries.length > 0 ? (
          <TailTagCard>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Follow up with new friends</Text>
              <View style={styles.itemList}>
                {followUpEntries.map((entry) => {
                  const ownerDisplayName =
                    entry.ownerName ?? entry.ownerUsername ?? 'Unknown owner';

                  return (
                    <View
                      key={`followup-${entry.fursuitId}-${entry.ownerId}`}
                      style={styles.followUpCard}
                    >
                      <View style={styles.followUpHeader}>
                        <Text style={styles.followUpTitle}>{ownerDisplayName}</Text>
                        {entry.ownerId ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${ownerDisplayName} profile`}
                            style={({ pressed }) => [
                              styles.followUpProfileLink,
                              pressed && styles.followUpProfileLinkPressed,
                            ]}
                            onPress={() =>
                              router.push({
                                pathname: '/profile/[id]',
                                params: { id: entry.ownerId! },
                              })
                            }
                          >
                            <Text style={styles.followUpProfileLinkText}>View profile</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      <Text style={styles.rowSubtle}>
                        Met via {entry.name ?? 'Unknown fursuit'}
                      </Text>
                      {entry.pronouns ? (
                        <Text style={styles.followUpBody}>Pronouns: {entry.pronouns}</Text>
                      ) : null}
                      {entry.askMeAbout ? (
                        <Text style={styles.followUpBody}>Ask me about: {entry.askMeAbout}</Text>
                      ) : null}
                      {entry.likesAndInterests ? (
                        <Text style={styles.followUpBody}>Likes: {entry.likesAndInterests}</Text>
                      ) : null}
                      {entry.socialLinks.length > 0 ? (
                        <View style={styles.socialLinksList}>
                          {entry.socialLinks.map((link) => (
                            <Pressable
                              key={`${entry.fursuitId}-${link.label}-${link.url}`}
                              accessibilityRole="button"
                              accessibilityLabel={`Open ${link.label} link`}
                              style={({ pressed }) => [
                                styles.socialLink,
                                pressed && styles.socialLinkPressed,
                              ]}
                              onPress={() => {
                                void openExternalLink(link.url);
                              }}
                            >
                              <Text style={styles.socialLabel}>{link.label}</Text>
                              <Text
                                style={styles.socialUrl}
                                numberOfLines={1}
                              >
                                {link.url}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          </TailTagCard>
        ) : null}

        {ownedFursuits.length > 0 ? (
          <TailTagCard>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your suit spotlight</Text>
              <Text style={styles.message}>
                Your suits were caught {formatCount(recap.ownFursuitsCaughtCount)} times by{' '}
                {formatCount(recap.uniqueCatchersForOwnFursuitsCount)} unique players.
              </Text>
              <View style={styles.itemList}>
                {ownedFursuits.map((entry) => {
                  const seenAt = formatSeenAt(entry);

                  return (
                    <Pressable
                      key={`owned-${entry.fursuitId}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${entry.name ?? 'fursuit'} profile`}
                      onPress={() =>
                        router.push({
                          pathname: '/fursuits/[id]',
                          params: { id: entry.fursuitId },
                        })
                      }
                      style={({ pressed }) => [styles.rowCard, pressed && styles.rowCardPressed]}
                    >
                      <AppAvatar
                        url={entry.avatarUrl}
                        size="sm"
                        fallback="fursuit"
                        style={styles.rowAvatar}
                      />
                      <View style={styles.rowBody}>
                        <Text
                          style={styles.rowTitle}
                          numberOfLines={1}
                        >
                          {entry.name ?? 'Unknown fursuit'}
                        </Text>
                        <Text style={styles.rowSubtle}>
                          Caught {formatCount(entry.timesCaught)} times by{' '}
                          {formatCount(entry.uniqueCatchers)} players
                        </Text>
                        {seenAt ? <Text style={styles.rowSubtle}>{seenAt}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </TailTagCard>
        ) : null}

        {awards.length > 0 ? (
          <TailTagCard>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Awards</Text>
              <View style={styles.awardsList}>
                {awards.map((award) => (
                  <View
                    key={award.code}
                    style={styles.awardCard}
                  >
                    <Text style={styles.awardTitle}>{award.title}</Text>
                    <Text style={styles.awardDescription}>{award.description}</Text>
                  </View>
                ))}
              </View>
            </View>
          </TailTagCard>
        ) : null}

        <TailTagCard>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Achievements and daily tasks</Text>
            <Text style={styles.message}>{dailySummaryText}</Text>
            {dailySummary.completedDays.length > 0 ? (
              <View style={styles.dayChipRow}>
                {dailySummary.completedDays.map((day) => (
                  <View
                    key={day}
                    style={styles.dayChip}
                  >
                    <Text style={styles.dayChipLabel}>{toDisplayDate(day) ?? day}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.achievementsSection}>
              <Text style={styles.sectionSubTitle}>
                Achievements unlocked ({formatCount(achievements.length)})
              </Text>
              {achievements.length === 0 ? (
                <Text style={styles.message}>
                  No convention achievements unlocked for this event.
                </Text>
              ) : (
                <View style={styles.achievementList}>
                  {achievements.map((achievement) => (
                    <View
                      key={achievement.achievementId}
                      style={styles.achievementRow}
                    >
                      <Text style={styles.achievementTitle}>
                        {achievement.name ?? 'Unnamed achievement'}
                      </Text>
                      {achievement.description ? (
                        <Text style={styles.achievementDescription}>{achievement.description}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </TailTagCard>

        <TailTagCard>
          <View style={styles.footerActions}>
            <TailTagButton
              variant="outline"
              onPress={() => router.push('/caught')}
            >
              View caught fursuits
            </TailTagButton>
          </View>
        </TailTagCard>
      </ScrollView>
    </View>
  );
}
