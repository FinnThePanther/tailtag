import { ACHIEVEMENT_RULE_IDS } from "../constants.ts";
import type { AwardCandidate, ProfileEventContext, ProfileRuleDefinition } from "../types.ts";

const profileRules: ProfileRuleDefinition[] = [
  {
    ruleId: ACHIEVEMENT_RULE_IDS.PROFILE_COMPLETE,
    achievementKey: "PROFILE_COMPLETE",
    eventType: "profile_updated",
    metadata: {
      displayName: "Profile Complete",
      description: "Add a username and bio.",
      category: "meta",
      recipientRole: "any",
      canEvaluateClient: true,
      resetMode: "none",
    },
    requiredStats: [],
    evaluate(context: ProfileEventContext): AwardCandidate[] {
      const { profile } = context;
      if (!profile.hasUsername || !profile.hasBio) {
        return [];
      }
      return [
        {
          ruleId: ACHIEVEMENT_RULE_IDS.PROFILE_COMPLETE,
          achievementKey: "PROFILE_COMPLETE",
          userId: context.userId,
          context: {
            user_id: context.userId,
          },
        },
      ];
    },
  },
];

export function evaluateProfileAchievements(context: ProfileEventContext): AwardCandidate[] {
  return profileRules.flatMap((rule) => rule.evaluate(context));
}

export { profileRules };
