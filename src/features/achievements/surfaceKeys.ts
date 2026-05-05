import type { AchievementTriggerEvent } from '../../types/database';
import type { AchievementWithStatus } from './api/achievements';

export const CHECKED_IN_ACHIEVEMENT_SURFACE_KEY = 'achievement:checked-in';

type AchievementSurfaceInput = {
  achievementId?: string | null;
  achievementKey?: string | null;
  achievementName?: string | null;
  triggerEvent?: AchievementTriggerEvent | string | null;
};

function normalizeAchievementToken(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized.length > 0 ? normalized : null;
}

function isCheckedInToken(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return (
    value === 'explorer' ||
    value === 'checked_in' ||
    value === 'check_in' ||
    value === 'checkin' ||
    value.endsWith('_checked_in') ||
    value.endsWith('_check_in') ||
    value.endsWith('_checkin')
  );
}

function isCheckedInAchievement(input: AchievementSurfaceInput): boolean {
  const achievementKey = normalizeAchievementToken(input.achievementKey);
  const achievementName = normalizeAchievementToken(input.achievementName);
  const triggerEvent = input.triggerEvent ?? null;

  return (
    isCheckedInToken(achievementKey) ||
    isCheckedInToken(achievementName) ||
    triggerEvent === 'convention.checkin'
  );
}

export function getAchievementSurfaceKey(achievement: AchievementWithStatus): string {
  if (
    isCheckedInAchievement({
      achievementId: achievement.id,
      achievementKey: achievement.key,
      achievementName: achievement.name,
      triggerEvent: achievement.triggerEvent,
    })
  ) {
    return CHECKED_IN_ACHIEVEMENT_SURFACE_KEY;
  }

  return `achievement:${achievement.id}`;
}

export function getAchievementAwardSurfaceKey(input: AchievementSurfaceInput): string | null {
  if (isCheckedInAchievement(input)) {
    return CHECKED_IN_ACHIEVEMENT_SURFACE_KEY;
  }

  if (input.achievementId) {
    return `achievement:${input.achievementId}`;
  }

  if (input.achievementKey) {
    return `achievement-key:${input.achievementKey}`;
  }

  return null;
}
