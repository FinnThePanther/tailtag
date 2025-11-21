import { ACHIEVEMENT_RULE_IDS } from "../constants.ts";
import type { AwardCandidate, SimpleEventContext, SimpleRuleDefinition } from "../types.ts";

const simpleRules: SimpleRuleDefinition[] = [
  {
    ruleId: ACHIEVEMENT_RULE_IDS.GETTING_STARTED,
    achievementKey: "getting_started",
    eventType: "onboarding_completed",
    metadata: {
      displayName: "Getting Started",
      description: "Finish the onboarding flow.",
      category: "meta",
      recipientRole: "any",
      canEvaluateClient: true,
      resetMode: "none",
    },
    requiredStats: [],
    evaluate(context: SimpleEventContext): AwardCandidate[] {
      return [
        {
          ruleId: ACHIEVEMENT_RULE_IDS.GETTING_STARTED,
          achievementKey: "getting_started",
          userId: context.userId,
          context: {
            user_id: context.userId,
            source_event_id: context.eventId,
          },
        },
      ];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.EXPLORER,
    achievementKey: "EXPLORER",
    eventType: "convention_joined",
    metadata: {
      displayName: "Explorer",
      description: "Join a convention in the app.",
      category: "fun",
      recipientRole: "catcher",
      canEvaluateClient: true,
      resetMode: "none",
    },
    requiredStats: [],
    evaluate(context: SimpleEventContext): AwardCandidate[] {
      if (!context.conventionId) {
        return [];
      }
      return [
        {
          ruleId: ACHIEVEMENT_RULE_IDS.EXPLORER,
          achievementKey: "EXPLORER",
          userId: context.userId,
          context: {
            user_id: context.userId,
            convention_id: context.conventionId,
          },
        },
      ];
    },
  },
];

export function evaluateSimpleEventAchievements(
  eventType: "onboarding_completed" | "convention_joined",
  context: SimpleEventContext,
): AwardCandidate[] {
  return simpleRules
    .filter((rule) => rule.eventType === eventType)
    .flatMap((rule) => rule.evaluate(context));
}

export { simpleRules };
