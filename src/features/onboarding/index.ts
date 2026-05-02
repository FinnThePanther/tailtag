export {
  createQuickFursuit,
  completeOnboarding,
  emitOnboardingCompletedEvent,
  type FursuitPhotoCandidate,
  GETTING_STARTED_ACHIEVEMENT_KEY,
} from './api/onboarding';
export {
  ONBOARDING_STEPS,
  clearOnboardingProgress,
  createEmptyFursuitDraft,
  createInitialOnboardingProgress,
  loadOnboardingProgress,
  saveOnboardingProgress,
  type OnboardingFursuitDraft,
  type OnboardingProgress,
  type OnboardingStepId,
} from './progress';
