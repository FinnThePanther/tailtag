import { useState } from 'react';
import { Text, View } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { TailTagCard } from '../../../components/ui/TailTagCard';
import { completeOnboarding, emitOnboardingCompletedEvent } from '../../onboarding';
import { achievementsStatusQueryKey } from '../../achievements';
import { profileQueryKey, type ProfileSummary } from '../../profile';
import { styles } from './AchievementStep.styles';

type AchievementStepProps = {
  userId: string;
  hasJoinedConvention: boolean;
  hasFursuit: boolean;
  hasEnabledNotifications: boolean;
  onFinish: () => void;
};

export function AchievementStep({
  userId,
  hasJoinedConvention,
  hasFursuit,
  hasEnabledNotifications,
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

      queryClient.setQueryData<ProfileSummary | null>(profileQueryKey(userId), (current) =>
        current
          ? {
              ...current,
              onboarding_completed: true,
              is_new: false,
            }
          : current,
      );

      await queryClient.invalidateQueries({
        queryKey: profileQueryKey(userId),
      });
      await queryClient.invalidateQueries({
        queryKey: achievementsStatusQueryKey(userId),
      });

      // Navigate immediately
      onFinish();

      // Emit event after navigation (fire-and-forget)
      // Toast will appear on home screen a few seconds later
      emitOnboardingCompletedEvent(userId);
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
          You&apos;re ready to play TailTag! The Getting Started achievement is now yours — check
          the achievements screen to see how to earn more achievements.
        </Text>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>What you accomplished</Text>
          <View style={styles.summaryItem}>
            <View style={[styles.dot, hasJoinedConvention ? styles.dotPrimary : styles.dotMuted]} />
            <Text style={styles.summaryText}>
              {hasJoinedConvention
                ? 'Joined your first convention'
                : 'You can join a convention anytime'}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <View style={[styles.dot, hasFursuit ? styles.dotPrimary : styles.dotMuted]} />
            <Text style={styles.summaryText}>
              {hasFursuit ? 'Registered a fursuit' : 'You can add a fursuit anytime'}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <View
              style={[styles.dot, hasEnabledNotifications ? styles.dotPrimary : styles.dotMuted]}
            />
            <Text style={styles.summaryText}>
              {hasEnabledNotifications
                ? 'Enabled notifications'
                : 'You can enable notifications anytime'}
            </Text>
          </View>
        </View>

        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

        <TailTagButton
          onPress={handleFinish}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          Finish Onboarding
        </TailTagButton>
      </TailTagCard>
    </View>
  );
}
