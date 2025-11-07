import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { completeOnboarding } from '../../onboarding';
import { achievementsStatusQueryKey } from '../../achievements';
import { profileQueryKey, type ProfileSummary } from '../../profile';
import { colors, spacing } from '../../../theme';

type AchievementStepProps = {
  userId: string;
  hasTutorialCatch: boolean;
  hasFursuit: boolean;
  onFinish: () => void;
};

export function AchievementStep({
  userId,
  hasTutorialCatch,
  hasFursuit,
  onFinish,
}: AchievementStepProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFinish = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await completeOnboarding(userId);

      queryClient.setQueryData<ProfileSummary | null>(profileQueryKey(userId), (current) => ({
        username: current?.username ?? null,
        bio: current?.bio ?? null,
        avatar_url: current?.avatar_url ?? null,
        onboarding_completed: true,
        is_new: false,
      }));

      await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
      await queryClient.invalidateQueries({ queryKey: achievementsStatusQueryKey(userId) });

      onFinish();
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'We could not finish onboarding right now. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <TailTagCard>
        <Text style={styles.eyebrow}>Step 5</Text>
        <Text style={styles.title}>Achievement unlocked!</Text>
        <Text style={styles.body}>
          You&apos;re ready to explore TailTag. The Getting Started achievement is now yours—check the
          achievements screen to see how to earn more.
        </Text>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>What you accomplished</Text>
          <View style={styles.summaryItem}>
            <View style={[styles.dot, styles.dotPrimary]} />
            <Text style={styles.summaryText}>Joined your first convention</Text>
          </View>
          <View style={styles.summaryItem}>
            <View style={[styles.dot, hasFursuit ? styles.dotPrimary : styles.dotMuted]} />
            <Text style={styles.summaryText}>
              {hasFursuit ? 'Registered a fursuit' : 'You can add a fursuit anytime'}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <View style={[styles.dot, hasTutorialCatch ? styles.dotPrimary : styles.dotMuted]} />
            <Text style={styles.summaryText}>
              {hasTutorialCatch ? 'Completed the tutorial catch' : 'Tutorial catch skipped'}
            </Text>
          </View>
        </View>

        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

        <TailTagButton onPress={handleFinish} loading={isSubmitting} disabled={isSubmitting}>
          Finish Onboarding
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
    marginBottom: spacing.lg,
  },
  summary: {
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 18,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryText: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(148,163,184,0.4)',
  },
  dotPrimary: {
    backgroundColor: colors.primary,
  },
  dotMuted: {
    backgroundColor: 'rgba(148,163,184,0.4)',
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
});
