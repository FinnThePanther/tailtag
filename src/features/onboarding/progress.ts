import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { captureNonCriticalError } from '../../lib/sentry';
import type { FursuitPhotoCandidate } from './api/onboarding';

export const ONBOARDING_STEPS = [
  'welcome',
  'convention',
  'fursuit',
  'notifications',
  'achievement',
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export type OnboardingFursuitDraft = {
  isExpanded: boolean;
  nameInput: string;
  speciesInput: string;
  descriptionInput: string;
  selectedColorIds: string[];
  selectedPhoto: FursuitPhotoCandidate | null;
};

export type OnboardingProgress = {
  currentStep: OnboardingStepId;
  hasJoinedConvention: boolean;
  hasRegisteredFursuit: boolean;
  hasEnabledNotifications: boolean;
  fursuitDraft: OnboardingFursuitDraft;
};

export const createEmptyFursuitDraft = (): OnboardingFursuitDraft => ({
  isExpanded: false,
  nameInput: '',
  speciesInput: '',
  descriptionInput: '',
  selectedColorIds: [],
  selectedPhoto: null,
});

export const createInitialOnboardingProgress = (): OnboardingProgress => ({
  currentStep: 'welcome',
  hasJoinedConvention: false,
  hasRegisteredFursuit: false,
  hasEnabledNotifications: false,
  fursuitDraft: createEmptyFursuitDraft(),
});

const storageKeyForUser = (userId: string) => `tailtag:onboardingProgress:v1:${userId}`;

const draftPhotoDirectory = (userId: string) => {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  return `${FileSystem.documentDirectory}onboarding-drafts/${userId}/`;
};

const isOnboardingDraftPhoto = (userId: string, photo: FursuitPhotoCandidate | null) => {
  const directory = draftPhotoDirectory(userId);
  return Boolean(directory && photo?.uri.startsWith(directory));
};

const deleteOnboardingDraftPhoto = async (userId: string, photo: FursuitPhotoCandidate | null) => {
  if (!isOnboardingDraftPhoto(userId, photo)) {
    return;
  }

  const uri = photo?.uri;

  if (!uri) {
    return;
  }

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    captureNonCriticalError(error, {
      scope: 'onboarding.progress.deleteDraftPhoto',
      userId,
      uri,
    });
  }
};

const isStepId = (value: unknown): value is OnboardingStepId =>
  typeof value === 'string' && ONBOARDING_STEPS.includes(value as OnboardingStepId);

const isPhotoCandidate = (value: unknown): value is FursuitPhotoCandidate => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<FursuitPhotoCandidate>;
  return (
    typeof candidate.uri === 'string' &&
    typeof candidate.mimeType === 'string' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.fileSize === 'number'
  );
};

const normalizeString = (value: unknown) => (typeof value === 'string' ? value : '');

const normalizeFursuitDraft = (value: unknown): OnboardingFursuitDraft => {
  if (!value || typeof value !== 'object') {
    return createEmptyFursuitDraft();
  }

  const draft = value as Partial<OnboardingFursuitDraft>;
  const selectedColorIds = Array.isArray(draft.selectedColorIds)
    ? Array.from(
        new Set(
          draft.selectedColorIds.filter(
            (colorId): colorId is string => typeof colorId === 'string' && colorId.length > 0,
          ),
        ),
      )
    : [];

  return {
    isExpanded: draft.isExpanded === true,
    nameInput: normalizeString(draft.nameInput),
    speciesInput: normalizeString(draft.speciesInput),
    descriptionInput: normalizeString(draft.descriptionInput),
    selectedColorIds,
    selectedPhoto: isPhotoCandidate(draft.selectedPhoto) ? draft.selectedPhoto : null,
  };
};

const normalizeProgress = (value: unknown): OnboardingProgress | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const progress = value as Partial<OnboardingProgress>;

  if (!isStepId(progress.currentStep)) {
    return null;
  }

  return {
    currentStep: progress.currentStep,
    hasJoinedConvention: progress.hasJoinedConvention === true,
    hasRegisteredFursuit: progress.hasRegisteredFursuit === true,
    hasEnabledNotifications: progress.hasEnabledNotifications === true,
    fursuitDraft: normalizeFursuitDraft(progress.fursuitDraft),
  };
};

export async function loadOnboardingProgress(userId: string): Promise<OnboardingProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKeyForUser(userId));

    if (!raw) {
      return null;
    }

    const progress = normalizeProgress(JSON.parse(raw));

    if (!progress) {
      await AsyncStorage.removeItem(storageKeyForUser(userId));
    }

    return progress;
  } catch (error) {
    captureNonCriticalError(error, {
      scope: 'onboarding.progress.load',
      userId,
    });
    return null;
  }
}

export async function saveOnboardingProgress(
  userId: string,
  progress: OnboardingProgress,
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKeyForUser(userId), JSON.stringify(progress));
  } catch (error) {
    captureNonCriticalError(error, {
      scope: 'onboarding.progress.save',
      userId,
    });
  }
}

export async function clearOnboardingProgress(userId: string): Promise<void> {
  try {
    const key = storageKeyForUser(userId);
    const raw = await AsyncStorage.getItem(key);
    const progress = raw ? normalizeProgress(JSON.parse(raw)) : null;

    await deleteOnboardingDraftPhoto(userId, progress?.fursuitDraft.selectedPhoto ?? null);
    await AsyncStorage.removeItem(key);
  } catch (error) {
    captureNonCriticalError(error, {
      scope: 'onboarding.progress.clear',
      userId,
    });
  }
}
