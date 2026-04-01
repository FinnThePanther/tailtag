import { ACHIEVEMENT_RULE_IDS } from "../constants.ts";
import type { AwardCandidate } from "../types.ts";

/**
 * Evaluates the ACHIEVEMENT_HUNTER meta achievement.
 * Must be called as a post-award pass after the main catch batch is granted,
 * so that the count reflects newly awarded achievements.
 */
export function evaluateMetaAchievements(
  userId: string,
  totalRealAchievements: number,
): AwardCandidate[] {
  if (totalRealAchievements >= 10) {
    return [
      {
        ruleId: ACHIEVEMENT_RULE_IDS.ACHIEVEMENT_HUNTER,
        achievementKey: "ACHIEVEMENT_HUNTER",
        userId,
        context: {
          total_achievements: totalRealAchievements,
        },
      },
    ];
  }
  return [];
}
