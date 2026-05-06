import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../src/features/auth';
import { KeyboardAwareFormWrapper } from '../../src/components/ui/KeyboardAwareFormWrapper';
import { createProfileQueryOptions, type ProfileSummary } from '../../src/features/profile';
import {
  PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY,
  fetchProfileConventionMemberships,
  type ConventionMembership,
} from '../../src/features/conventions';
import { createMySuitsQueryOptions } from '../../src/features/suits';
import { ProgressDots } from '../../src/features/onboarding/components/ProgressDots';
import { WelcomeStep } from '../../src/features/onboarding/components/WelcomeStep';
import { ConventionStep } from '../../src/features/onboarding/components/ConventionStep';
import { FursuitStep } from '../../src/features/onboarding/components/FursuitStep';
import { AchievementStep } from '../../src/features/onboarding/components/AchievementStep';
import { NotificationsStep } from '../../src/features/onboarding/components/NotificationsStep';
import {
  ONBOARDING_STEPS,
  clearOnboardingProgress,
  createEmptyFursuitDraft,
  createInitialOnboardingProgress,
  loadOnboardingProgress,
  saveOnboardingProgress,
  type OnboardingFursuitDraft,
  type OnboardingStepId,
} from '../../src/features/onboarding';
import { colors } from '../../src/theme';
import { styles } from '../../src/app-styles/onboarding/index.styles';

const stepIndex = (step: OnboardingStepId) => ONBOARDING_STEPS.indexOf(step);

const LoadingView = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator
      size="large"
      color={colors.primary}
    />
  </View>
);

export default function OnboardingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [currentStep, setCurrentStep] = useState<OnboardingStepId>('welcome');
  const [hasJoinedConvention, setHasJoinedConvention] = useState(false);
  const [hasRegisteredFursuit, setHasRegisteredFursuit] = useState(false);
  const [hasEnabledNotifications, setHasEnabledNotifications] = useState(false);
  const [fursuitDraft, setFursuitDraft] = useState<OnboardingFursuitDraft>(createEmptyFursuitDraft);
  const [isHydratingProgress, setIsHydratingProgress] = useState(true);

  const profileQueryOptions = useMemo(
    () => (userId ? createProfileQueryOptions(userId) : null),
    [userId],
  );

  const { data: profile } = useQuery<ProfileSummary | null, Error>({
    ...(profileQueryOptions ?? {
      queryKey: ['profile', 'guest'],
      queryFn: async () => null,
    }),
    enabled: Boolean(userId),
  });

  const { data: existingConventionMemberships = [] } = useQuery<ConventionMembership[], Error>({
    queryKey: userId
      ? [PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY, userId]
      : ['convention-memberships', 'guest'],
    queryFn: fetchProfileConventionMemberships,
    enabled: Boolean(userId),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: mySuits = [] } = useQuery({
    ...(userId
      ? createMySuitsQueryOptions(userId)
      : {
          queryKey: ['my-suits', 'guest'],
          queryFn: async () => [],
        }),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    if (!userId) {
      setIsHydratingProgress(false);
      return;
    }

    let isMounted = true;

    setIsHydratingProgress(true);
    void loadOnboardingProgress(userId).then((savedProgress) => {
      if (!isMounted) {
        return;
      }

      const progress = savedProgress ?? createInitialOnboardingProgress();
      setCurrentStep(progress.currentStep);
      setHasJoinedConvention(progress.hasJoinedConvention);
      setHasRegisteredFursuit(progress.hasRegisteredFursuit);
      setHasEnabledNotifications(progress.hasEnabledNotifications);
      setFursuitDraft(progress.fursuitDraft);
      setIsHydratingProgress(false);
    });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      router.replace('/auth');
      return;
    }

    if (profile?.onboarding_completed) {
      void clearOnboardingProgress(userId);
      router.replace('/');
    }
  }, [profile?.onboarding_completed, router, userId]);

  useEffect(() => {
    if (existingConventionMemberships.length > 0) {
      setHasJoinedConvention(true);
    }
  }, [existingConventionMemberships.length]);

  useEffect(() => {
    if (mySuits.length > 0) {
      setHasRegisteredFursuit(true);
    }
  }, [mySuits.length]);

  useEffect(() => {
    if (profile?.push_notifications_enabled) {
      setHasEnabledNotifications(true);
    }
  }, [profile?.push_notifications_enabled]);

  useEffect(() => {
    if (!userId || isHydratingProgress || profile?.onboarding_completed) {
      return;
    }

    void saveOnboardingProgress(userId, {
      currentStep,
      hasJoinedConvention,
      hasRegisteredFursuit,
      hasEnabledNotifications,
      fursuitDraft,
    });
  }, [
    currentStep,
    fursuitDraft,
    hasEnabledNotifications,
    hasJoinedConvention,
    hasRegisteredFursuit,
    isHydratingProgress,
    profile?.onboarding_completed,
    userId,
  ]);

  const goToNextStep = useCallback(() => {
    setCurrentStep((current) => {
      const currentIdx = stepIndex(current);
      const nextIdx = Math.min(currentIdx + 1, ONBOARDING_STEPS.length - 1);
      return ONBOARDING_STEPS[nextIdx];
    });
  }, []);

  const handleFinish = useCallback(() => {
    if (userId) {
      void clearOnboardingProgress(userId);
    }
    router.replace('/');
  }, [router, userId]);

  const currentIndex = stepIndex(currentStep);
  const hasJoinedConventionForSummary =
    hasJoinedConvention || existingConventionMemberships.length > 0;
  const hasFursuitForSummary = hasRegisteredFursuit || mySuits.length > 0;
  const hasEnabledNotificationsForSummary =
    hasEnabledNotifications || profile?.push_notifications_enabled === true;

  if (!userId || isHydratingProgress) {
    return <LoadingView />;
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'bottom']}
    >
      <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
        <Text style={styles.header}>New player onboarding</Text>
        <ProgressDots
          currentIndex={currentIndex}
          total={ONBOARDING_STEPS.length}
        />

        {currentStep === 'welcome' ? (
          <WelcomeStep onContinue={goToNextStep} />
        ) : currentStep === 'convention' ? (
          <ConventionStep
            userId={userId}
            onComplete={() => {
              setHasJoinedConvention(true);
              goToNextStep();
            }}
            onSkip={goToNextStep}
          />
        ) : currentStep === 'fursuit' ? (
          <FursuitStep
            userId={userId}
            onSkip={() => {
              setHasRegisteredFursuit(mySuits.length > 0);
              setFursuitDraft(createEmptyFursuitDraft());
              goToNextStep();
            }}
            onComplete={({ created }) => {
              setHasRegisteredFursuit(created);
              setFursuitDraft(createEmptyFursuitDraft());
              goToNextStep();
            }}
            draft={fursuitDraft}
            onDraftChange={setFursuitDraft}
          />
        ) : currentStep === 'notifications' ? (
          <NotificationsStep
            userId={userId}
            onComplete={(enabled) => {
              setHasEnabledNotifications(enabled || profile?.push_notifications_enabled === true);
              goToNextStep();
            }}
          />
        ) : (
          <AchievementStep
            userId={userId}
            hasJoinedConvention={hasJoinedConventionForSummary}
            hasFursuit={hasFursuitForSummary}
            hasEnabledNotifications={hasEnabledNotificationsForSummary}
            onFinish={handleFinish}
          />
        )}
      </KeyboardAwareFormWrapper>
    </SafeAreaView>
  );
}
