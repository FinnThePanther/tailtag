import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../src/features/auth';
import { createProfileQueryOptions, type ProfileSummary } from '../../src/features/profile';
import { ProgressDots } from '../../src/features/onboarding/components/ProgressDots';
import { WelcomeStep } from '../../src/features/onboarding/components/WelcomeStep';
import { ConventionStep } from '../../src/features/onboarding/components/ConventionStep';
import { FursuitStep } from '../../src/features/onboarding/components/FursuitStep';
import { TutorialCatchStep } from '../../src/features/onboarding/components/TutorialCatchStep';
import { AchievementStep } from '../../src/features/onboarding/components/AchievementStep';
import { colors, spacing } from '../../src/theme';

const STEPS = ['welcome', 'convention', 'fursuit', 'tutorial', 'achievement'] as const;
type StepId = (typeof STEPS)[number];

const stepIndex = (step: StepId) => STEPS.indexOf(step);

const LoadingView = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={colors.primary} />
  </View>
);

export default function OnboardingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [currentStep, setCurrentStep] = useState<StepId>('welcome');
  const [hasRegisteredFursuit, setHasRegisteredFursuit] = useState(false);
  const [hasTutorialCatch, setHasTutorialCatch] = useState(false);

  const profileQueryOptions = useMemo(
    () => (userId ? createProfileQueryOptions(userId) : null),
    [userId]
  );

  const {
    data: profile,
    isLoading,
    isFetching,
  } = useQuery<ProfileSummary | null, Error>({
    ...(profileQueryOptions ?? {
      queryKey: ['profile', 'guest'],
      queryFn: async () => null,
    }),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    if (!userId) {
      router.replace('/auth');
      return;
    }

    if (profile?.onboarding_completed) {
      router.replace('/');
    }
  }, [profile?.onboarding_completed, router, userId]);

  const goToNextStep = useCallback(() => {
    setCurrentStep((current) => {
      const currentIdx = stepIndex(current);
      const nextIdx = Math.min(currentIdx + 1, STEPS.length - 1);
      return STEPS[nextIdx];
    });
  }, []);

  const handleFinish = useCallback(() => {
    router.replace('/');
  }, [router]);

  const currentIndex = stepIndex(currentStep);

  if (!userId) {
    return <LoadingView />;
  }

  if ((isLoading || isFetching) && !profile) {
    return <LoadingView />;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.header}>New player onboarding</Text>
      <ProgressDots currentIndex={currentIndex} total={STEPS.length} />

      {currentStep === 'welcome' ? (
        <WelcomeStep onContinue={goToNextStep} />
      ) : currentStep === 'convention' ? (
        <ConventionStep
          userId={userId}
          onComplete={() => {
            goToNextStep();
          }}
        />
      ) : currentStep === 'fursuit' ? (
        <FursuitStep
          userId={userId}
          onSkip={() => {
            setHasRegisteredFursuit(false);
            goToNextStep();
          }}
          onComplete={({ created }) => {
            setHasRegisteredFursuit(created);
            goToNextStep();
          }}
        />
      ) : currentStep === 'tutorial' ? (
        <TutorialCatchStep
          userId={userId}
          onSkip={() => {
            setHasTutorialCatch(false);
            goToNextStep();
          }}
          onComplete={({ recorded }) => {
            setHasTutorialCatch(recorded);
            goToNextStep();
          }}
        />
      ) : (
        <AchievementStep
          userId={userId}
          hasTutorialCatch={hasTutorialCatch}
          hasFursuit={hasRegisteredFursuit}
          onFinish={handleFinish}
        />
      )}
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
  header: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
