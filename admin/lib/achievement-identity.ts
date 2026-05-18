export const CHECKED_IN_CONVENTION_ACHIEVEMENT_ERROR =
  'Checked In is an account-level achievement. Do not create convention-scoped Checked In achievements.';

type AchievementIdentityInput = {
  key?: string | null;
  name?: string | null;
  triggerEvent?: string | null;
};

function normalizeAchievementToken(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized.length > 0 ? normalized : null;
}

function isCheckedInToken(value: string | null): boolean {
  if (!value) return false;

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

export function isCheckedInAchievementIdentity(input: AchievementIdentityInput): boolean {
  const key = normalizeAchievementToken(input.key);
  const name = normalizeAchievementToken(input.name);

  return (
    isCheckedInToken(key) || isCheckedInToken(name) || input.triggerEvent === 'convention.checkin'
  );
}

export function assertNotCheckedInConventionAchievement(input: AchievementIdentityInput) {
  if (isCheckedInAchievementIdentity(input)) {
    throw new Error(CHECKED_IN_CONVENTION_ACHIEVEMENT_ERROR);
  }
}
