import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagProgressBar } from '../../src/components/ui/TailTagProgressBar';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { useAuth } from '../../src/features/auth';
import {
  ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY,
  CONVENTIONS_STALE_TIME,
  type ConventionSummary,
  fetchActiveProfileConventionIds,
  fetchJoinableConventions,
  JOINABLE_CONVENTIONS_QUERY_KEY,
} from '../../src/features/conventions';
import { useDailyTasks } from '../../src/features/daily-tasks';
import { colors } from '../../src/theme';
import { styles } from '../../src/app-styles/daily-tasks/index.styles';

function formatDayLabel(day: string, timezone: string): string {
  try {
    const date = new Date(`${day}T00:00:00`);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    }).format(date);
  } catch {
    return day;
  }
}

function formatCompletionTime(iso: string | null, timezone: string): string {
  if (!iso) {
    return '';
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(parsed);
}

function getTaskStatusCopy(
  taskRequirement: number,
  currentCount: number,
  isCompleted: boolean,
): string {
  const remaining = Math.max(taskRequirement - currentCount, 0);
  if (isCompleted) {
    return 'Completed';
  }

  if (remaining === 0) {
    return 'Ready to claim';
  }

  return `${remaining} to go`;
}

export default function DailyTasksScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const {
    data: conventions = [],
    isLoading: isConventionsLoading,
    error: conventionsError,
  } = useQuery<ConventionSummary[], Error>({
    queryKey: [JOINABLE_CONVENTIONS_QUERY_KEY],
    queryFn: () => fetchJoinableConventions(),
    staleTime: CONVENTIONS_STALE_TIME,
    enabled: Boolean(userId),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const {
    data: profileConventionIds = [],
    isLoading: isProfileConventionsLoading,
    error: profileConventionsError,
  } = useQuery<string[], Error>({
    queryKey: [ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY, userId],
    queryFn: () => fetchActiveProfileConventionIds(userId!),
    enabled: Boolean(userId),
    staleTime: CONVENTIONS_STALE_TIME,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const availableConventions = useMemo(() => {
    if (!profileConventionIds || profileConventionIds.length === 0) {
      return [] as ConventionSummary[];
    }
    return conventions.filter((convention) => profileConventionIds.includes(convention.id));
  }, [conventions, profileConventionIds]);

  const [selectedConventionId, setSelectedConventionId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedConventionId((current) => {
      if (availableConventions.length === 0) {
        return null;
      }

      if (current && availableConventions.some((convention) => convention.id === current)) {
        return current;
      }
      return availableConventions[0]?.id ?? null;
    });
  }, [availableConventions]);

  const selectedConvention = useMemo(() => {
    return availableConventions.find((item) => item.id === selectedConventionId) ?? null;
  }, [availableConventions, selectedConventionId]);

  const { data, isLoading, isFetching, error, refetch, countdown } = useDailyTasks(
    userId,
    selectedConventionId,
    { suppressToasts: true },
  );

  const tasks = data?.tasks ?? [];
  const totalCount = data?.totalCount ?? 0;
  const completedCount = data?.completedCount ?? 0;
  const allComplete = totalCount > 0 && completedCount === totalCount;
  const progressValue = totalCount > 0 ? Math.min(completedCount / totalCount, 1) : 0;
  const remainingCount = Math.max(totalCount - completedCount, 0);
  const timezone = data?.timezone ?? selectedConvention?.timezone ?? 'UTC';
  const isDailyTasksUnavailable = data?.availability && data.availability !== 'available';

  const isRefreshing = isFetching && !isLoading;

  const handleRetry = useCallback(() => {
    void refetch({ throwOnError: false });
  }, [refetch]);

  const handleConventionRequired = useCallback(() => {
    Alert.alert('Select a convention', 'Pick a convention to view its daily lineup.');
  }, []);

  const conventionErrorMessage =
    conventionsError?.message ?? profileConventionsError?.message ?? null;
  const isLoadingConventions = isConventionsLoading || isProfileConventionsLoading;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Daily Tasks"
        onBack={() => router.back()}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void refetch({ throwOnError: false });
            }}
            tintColor={colors.primary}
          />
        }
      >
        <TailTagCard style={styles.selectorCard}>
          <Text style={styles.selectorEyebrow}>Convention</Text>
          {isLoadingConventions ? (
            <Text style={styles.message}>Loading conventions...</Text>
          ) : conventionErrorMessage ? (
            <View style={styles.helper}>
              <Text style={styles.error}>{conventionErrorMessage}</Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={handleRetry}
              >
                Try again
              </TailTagButton>
            </View>
          ) : availableConventions.length === 0 ? (
            <Text style={styles.message}>
              Join or verify a playable convention to use convention features.
            </Text>
          ) : (
            <View style={styles.selectorRow}>
              {availableConventions.map((convention) => (
                <TailTagButton
                  key={convention.id}
                  size="sm"
                  variant={selectedConventionId === convention.id ? 'primary' : 'outline'}
                  onPress={() => setSelectedConventionId(convention.id)}
                  style={styles.selectorButton}
                >
                  {convention.name}
                </TailTagButton>
              ))}
            </View>
          )}
        </TailTagCard>

        <TailTagCard style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryEyebrow}>Daily Tasks</Text>
            <Text style={styles.summaryTitle}>
              {data ? formatDayLabel(data.day, timezone) : 'Pick a convention'}
            </Text>
          </View>

          <View style={styles.summaryStatsRow}>
            <View style={styles.summaryStat}>
              <Text
                numberOfLines={1}
                style={styles.statLabel}
              >
                Done
              </Text>
              <Text
                numberOfLines={1}
                style={styles.statValue}
              >
                {completedCount} / {totalCount}
              </Text>
            </View>
            <View style={styles.summaryStat}>
              <Text
                numberOfLines={1}
                style={styles.statLabel}
              >
                Streak
              </Text>
              <Text
                numberOfLines={1}
                style={styles.statValue}
              >
                {data?.streak.current ?? 0}
              </Text>
            </View>
            <View style={styles.summaryStat}>
              <Text
                numberOfLines={1}
                style={styles.statLabel}
              >
                Best
              </Text>
              <Text
                numberOfLines={1}
                style={styles.statValue}
              >
                {data?.streak.best ?? 0}
              </Text>
            </View>
          </View>

          <View style={styles.progressBlock}>
            <TailTagProgressBar value={progressValue} />
            <View style={styles.progressFooter}>
              <Text style={styles.progressHelper}>
                {!selectedConventionId
                  ? 'Join or verify a playable convention to begin.'
                  : isDailyTasksUnavailable
                    ? 'Daily tasks are only available while this convention is live.'
                    : totalCount === 0
                      ? "Today's lineup is being prepared."
                      : allComplete
                        ? 'All tasks complete - great job!'
                        : `${remainingCount} task${remainingCount === 1 ? '' : 's'} remaining`}
              </Text>
              <Text style={styles.countdownLabel}>
                {!selectedConventionId
                  ? 'No reset scheduled'
                  : isDailyTasksUnavailable
                    ? 'No reset scheduled'
                    : `Resets in ${countdown}`}
              </Text>
            </View>
          </View>
        </TailTagCard>

        <TailTagCard style={styles.tasksCard}>
          <Text style={styles.tasksTitle}>Today's tasks</Text>

          {!selectedConventionId ? (
            <View style={styles.helper}>
              <Text style={styles.message}>
                Join or verify a playable convention to use convention features.
              </Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={handleConventionRequired}
              >
                Choose convention
              </TailTagButton>
            </View>
          ) : isLoading ? (
            <Text style={styles.message}>Loading daily tasks...</Text>
          ) : error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>{error.message}</Text>
              <TailTagButton
                variant="outline"
                size="sm"
                onPress={handleRetry}
              >
                Try again
              </TailTagButton>
            </View>
          ) : isDailyTasksUnavailable ? (
            <Text style={styles.message}>
              Daily tasks are only available while this convention is live.
            </Text>
          ) : tasks.length === 0 ? (
            <Text style={styles.message}>No tasks available right now. Check back shortly.</Text>
          ) : (
            <View style={styles.tasksList}>
              {tasks.map((task) => {
                const progressFraction =
                  task.requirement > 0 ? Math.min(task.currentCount / task.requirement, 1) : 0;
                const clampedCount = Math.min(task.currentCount, task.requirement);
                const progressLabel = `${clampedCount} / ${task.requirement}`;
                const completionTime = task.isCompleted
                  ? formatCompletionTime(task.completedAt, timezone)
                  : '';

                return (
                  <View
                    key={task.id}
                    style={styles.taskRow}
                  >
                    <View style={styles.taskHeader}>
                      <Text style={styles.taskTitle}>{task.name}</Text>
                      <Text
                        numberOfLines={1}
                        style={task.isCompleted ? styles.taskBadgeDone : styles.taskBadgePending}
                      >
                        {getTaskStatusCopy(task.requirement, task.currentCount, task.isCompleted)}
                      </Text>
                    </View>
                    {task.conventionId !== null ? (
                      <View style={styles.conventionBadgeRow}>
                        <Text style={styles.conventionBadge}>Con exclusive</Text>
                      </View>
                    ) : null}
                    <Text style={styles.taskDescription}>{task.description}</Text>
                    <TailTagProgressBar
                      value={progressFraction}
                      style={styles.taskProgress}
                    />
                    <View style={styles.taskFooter}>
                      <Text style={styles.taskProgressLabel}>{progressLabel}</Text>
                      {completionTime ? (
                        <Text style={styles.taskCompletionLabel}>
                          Completed at {completionTime}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </TailTagCard>
      </ScrollView>
    </View>
  );
}
