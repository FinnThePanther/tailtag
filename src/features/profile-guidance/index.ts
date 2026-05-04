import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FursuitSummary } from '../suits';

export type ProfileGuidanceTaskId = 'fursuit-profile' | 'username' | 'goals';

export type ProfileGuidanceTask = {
  id: ProfileGuidanceTaskId;
  title: string;
  description: string;
  isComplete: boolean;
};

export type ProfileGuidanceState = {
  tasks: ProfileGuidanceTask[];
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
  nextTask: ProfileGuidanceTask | null;
  incompleteFursuits: FursuitSummary[];
};

export const usernameReviewedStorageKey = (userId: string) =>
  `tailtag:profile-guidance:username-reviewed:${userId}`;

export const goalsViewedStorageKey = (userId: string) =>
  `tailtag:profile-guidance:goals-viewed:${userId}`;

export const readyConfirmationSeenStorageKey = (userId: string) =>
  `tailtag:profile-guidance:ready-confirmation-seen:${userId}`;

export async function readProfileGuidanceFlag(key: string): Promise<boolean | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value === 'true';
  } catch (error) {
    console.warn('Failed to read profile guidance flag', error);
    return null;
  }
}

export async function writeProfileGuidanceFlag(key: string): Promise<void | null> {
  try {
    await AsyncStorage.setItem(key, 'true');
  } catch (error) {
    console.warn('Failed to write profile guidance flag', error);
    return null;
  }
}

export function hasAskMeAboutContent(suit: FursuitSummary): boolean {
  const topics =
    suit.bio?.askMeAbout
      ?.split(/[,;\n]+/)
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0) ?? [];

  return topics.length > 0;
}

export function getIncompleteFursuitProfiles(suits: FursuitSummary[]): FursuitSummary[] {
  return suits.filter((suit) => !hasAskMeAboutContent(suit));
}

export function createProfileGuidanceState(options: {
  suits: FursuitSummary[];
  usernameReviewed: boolean;
  goalsViewed: boolean;
}): ProfileGuidanceState {
  const { suits, usernameReviewed, goalsViewed } = options;
  const incompleteFursuits = getIncompleteFursuitProfiles(suits);
  const fursuitProfileComplete = suits.length > 0 && incompleteFursuits.length === 0;

  const tasks: ProfileGuidanceTask[] = [
    {
      id: 'fursuit-profile',
      title: 'Update your fursuit profile',
      description: 'Add "Ask Me About..." prompts and other profile details.',
      isComplete: fursuitProfileComplete,
    },
    {
      id: 'username',
      title: 'Review your username',
      description: 'Keep the generated username or pick one that others will recognize.',
      isComplete: usernameReviewed,
    },
    {
      id: 'goals',
      title: "View today's goals",
      description: 'Check daily tasks and achievements you can work on today.',
      isComplete: goalsViewed,
    },
  ];

  const completedCount = tasks.filter((task) => task.isComplete).length;

  return {
    tasks,
    completedCount,
    totalCount: tasks.length,
    isComplete: completedCount === tasks.length,
    nextTask: tasks.find((task) => !task.isComplete) ?? null,
    incompleteFursuits,
  };
}
