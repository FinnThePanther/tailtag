/**
 * Maximum number of non-tutorial fursuits a user can create
 * Tutorial fursuits do not count toward this limit
 */
export const MAX_FURSUITS_PER_USER = 5;

/**
 * Expanded beta limit for users included in the expanded fursuit limit rollout.
 */
export const EXPANDED_MAX_FURSUITS_PER_USER = 25;

export function getMaxFursuitsForFeatureState(expandedLimitEnabled: boolean): number {
  return expandedLimitEnabled ? EXPANDED_MAX_FURSUITS_PER_USER : MAX_FURSUITS_PER_USER;
}
