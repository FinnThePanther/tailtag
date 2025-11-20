import { ACHIEVEMENT_RULE_IDS } from "../constants";
import type { AwardCandidate, CatchEventContext, CatchRuleDefinition } from "../types";

function baseCatchContext(context: CatchEventContext, extra?: Record<string, unknown>) {
  return {
    catch_id: context.catchId,
    fursuit_id: context.fursuitId,
    convention_id: context.conventionId ?? null,
    fursuit_owner_id: context.fursuitOwnerId ?? null,
    ...extra,
  };
}

function awardSingle(
  context: CatchEventContext,
  ruleId: string,
  achievementKey: string,
  userId: string,
  extra?: Record<string, unknown>,
): AwardCandidate[] {
  return [
    {
      ruleId,
      achievementKey,
      userId,
      context: baseCatchContext(context, extra),
    },
  ];
}

export const catchRules: CatchRuleDefinition[] = [
  {
    ruleId: ACHIEVEMENT_RULE_IDS.FIRST_CATCH,
    achievementKey: "FIRST_CATCH",
    eventType: "catch_performed",
    metadata: {
      displayName: "First Catch",
      description: "Catch your very first fursuit.",
      category: "catching",
      recipientRole: "catcher",
      canEvaluateClient: true,
      resetMode: "none",
    },
    requiredStats: ["totalCatches"],
    evaluate(context) {
      if (context.isTutorial) return [];
      return context.stats.totalCatches === 1
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.FIRST_CATCH, "FIRST_CATCH", context.catcherId)
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.GETTING_THE_HANG_OF_IT,
    achievementKey: "GETTING_THE_HANG_OF_IT",
    eventType: "catch_performed",
    metadata: {
      displayName: "Getting the Hang of It",
      description: "Make 10 real catches.",
      category: "catching",
      recipientRole: "catcher",
      canEvaluateClient: true,
      resetMode: "none",
    },
    requiredStats: ["totalCatches"],
    evaluate(context) {
      if (context.isTutorial) return [];
      return context.stats.totalCatches >= 10
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.GETTING_THE_HANG_OF_IT, "GETTING_THE_HANG_OF_IT", context.catcherId, {
            total_catches: context.stats.totalCatches,
          })
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.SUPER_CATCHER,
    achievementKey: "SUPER_CATCHER",
    eventType: "catch_performed",
    metadata: {
      displayName: "Super Catcher",
      description: "Log 25 total catches.",
      category: "dedication",
      recipientRole: "catcher",
      canEvaluateClient: true,
      resetMode: "none",
    },
    requiredStats: ["totalCatches"],
    evaluate(context) {
      if (context.isTutorial) return [];
      return context.stats.totalCatches >= 25
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.SUPER_CATCHER, "SUPER_CATCHER", context.catcherId, {
            total_catches: context.stats.totalCatches,
          })
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.DEBUT_PERFORMANCE,
    achievementKey: "DEBUT_PERFORMANCE",
    eventType: "catch_performed",
    metadata: {
      displayName: "Debut Performance",
      description: "Your suit gets caught for the first time.",
      category: "fursuiter",
      recipientRole: "fursuit_owner",
      canEvaluateClient: false,
      resetMode: "none",
    },
    requiredStats: ["totalFursuitCatches"],
    evaluate(context) {
      if (context.isTutorial) return [];
      if (!context.fursuitOwnerId) return [];
      return context.stats.totalFursuitCatches === 1
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.DEBUT_PERFORMANCE, "DEBUT_PERFORMANCE", context.fursuitOwnerId, {
            owner_id: context.fursuitOwnerId,
          })
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.DAY_ONE_DEVOTEE,
    achievementKey: "DAY_ONE_DEVOTEE",
    eventType: "catch_performed",
    metadata: {
      displayName: "Day One Devotee",
      description: "Catch on the opening day of a convention.",
      category: "fun",
      recipientRole: "catcher",
      canEvaluateClient: false,
      resetMode: "windowed",
    },
    requiredStats: [],
    evaluate(context) {
      if (context.isTutorial) return [];
      if (!context.conventionId) return [];
      return context.timing.isConventionDayOne
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.DAY_ONE_DEVOTEE, "DAY_ONE_DEVOTEE", context.catcherId)
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.NIGHT_OWL,
    achievementKey: "NIGHT_OWL",
    eventType: "catch_performed",
    metadata: {
      displayName: "Night Owl",
      description: "Catch late at night.",
      category: "fun",
      recipientRole: "catcher",
      canEvaluateClient: false,
      resetMode: "none",
    },
    requiredStats: [],
    evaluate(context) {
      if (context.isTutorial) return [];
      return context.timing.isLateNight
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.NIGHT_OWL, "NIGHT_OWL", context.catcherId)
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.SUIT_SAMPLER,
    achievementKey: "SUIT_SAMPLER",
    eventType: "catch_performed",
    metadata: {
      displayName: "Suit Sampler",
      description: "Catch 5 distinct species.",
      category: "variety",
      recipientRole: "catcher",
      canEvaluateClient: false,
      resetMode: "none",
    },
    requiredStats: ["distinctSpeciesCaught"],
    evaluate(context) {
      if (context.isTutorial) return [];
      return context.stats.distinctSpeciesCaught >= 5
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.SUIT_SAMPLER, "SUIT_SAMPLER", context.catcherId, {
            distinct_species: context.stats.distinctSpeciesCaught,
          })
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.MIX_AND_MATCH,
    achievementKey: "MIX_AND_MATCH",
    eventType: "catch_performed",
    metadata: {
      displayName: "Mix and Match",
      description: "Catch a hybrid or multi-species suit.",
      category: "variety",
      recipientRole: "catcher",
      canEvaluateClient: false,
      resetMode: "none",
    },
    requiredStats: [],
    evaluate(context) {
      if (context.isTutorial) return [];
      return context.flags.hybridFursuit
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.MIX_AND_MATCH, "MIX_AND_MATCH", context.catcherId)
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.HYBRID_VIBES,
    achievementKey: "HYBRID_VIBES",
    eventType: "catch_performed",
    metadata: {
      displayName: "Hybrid Vibes",
      description: "Your hybrid suit gets caught.",
      category: "fursuiter",
      recipientRole: "fursuit_owner",
      canEvaluateClient: false,
      resetMode: "none",
    },
    requiredStats: [],
    evaluate(context) {
      if (context.isTutorial) return [];
      if (!context.fursuitOwnerId) return [];
      return context.flags.hybridFursuit
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.HYBRID_VIBES, "HYBRID_VIBES", context.fursuitOwnerId, {
            owner_id: context.fursuitOwnerId,
          })
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.DOUBLE_TROUBLE,
    achievementKey: "DOUBLE_TROUBLE",
    eventType: "catch_performed",
    metadata: {
      displayName: "Double Trouble",
      description: "Score two catches within a minute.",
      category: "fun",
      recipientRole: "catcher",
      canEvaluateClient: false,
      resetMode: "none",
    },
    requiredStats: [],
    evaluate(context) {
      if (context.isTutorial) return [];
      return context.flags.doubleCatchWithinMinute
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.DOUBLE_TROUBLE, "DOUBLE_TROUBLE", context.catcherId)
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.FAN_FAVORITE,
    achievementKey: "FAN_FAVORITE",
    eventType: "catch_performed",
    metadata: {
      displayName: "Fan Favorite",
      description: "Your suit is caught 25+ times at a single convention.",
      category: "fursuiter",
      recipientRole: "fursuit_owner",
      canEvaluateClient: false,
      resetMode: "windowed",
    },
    requiredStats: ["catchesAtConvention"],
    evaluate(context) {
      if (context.isTutorial) return [];
      if (!context.fursuitOwnerId) return [];
      if (!context.conventionId) return [];
      return context.stats.catchesAtConvention >= 25
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.FAN_FAVORITE, "FAN_FAVORITE", context.fursuitOwnerId, {
            owner_id: context.fursuitOwnerId,
            convention_id: context.conventionId,
            catches_at_convention: context.stats.catchesAtConvention,
          })
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.RARE_FIND,
    achievementKey: "RARE_FIND",
    eventType: "catch_performed",
    metadata: {
      displayName: "Rare Find",
      description: "Catch a suit that only a few have found at this convention.",
      category: "fun",
      recipientRole: "catcher",
      canEvaluateClient: false,
      resetMode: "windowed",
    },
    requiredStats: ["uniqueCatchersAtConvention"],
    evaluate(context) {
      if (context.isTutorial) return [];
      if (!context.conventionId) return [];
      return context.stats.uniqueCatchersAtConvention > 0 &&
        context.stats.uniqueCatchersAtConvention < 10
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.RARE_FIND, "RARE_FIND", context.catcherId, {
            unique_catchers: context.stats.uniqueCatchersAtConvention,
          })
        : [];
    },
  },
  {
    ruleId: ACHIEVEMENT_RULE_IDS.WORLD_TOUR,
    achievementKey: "WORLD_TOUR",
    eventType: "catch_performed",
    metadata: {
      displayName: "World Tour",
      description: "Catch at three different conventions.",
      category: "dedication",
      recipientRole: "catcher",
      canEvaluateClient: false,
      resetMode: "none",
    },
    requiredStats: ["distinctConventionsVisited"],
    evaluate(context) {
      if (context.isTutorial) return [];
      return context.stats.distinctConventionsVisited >= 3
        ? awardSingle(context, ACHIEVEMENT_RULE_IDS.WORLD_TOUR, "WORLD_TOUR", context.catcherId, {
            conventions: context.stats.distinctConventionsVisited,
          })
        : [];
    },
  },
];

export function evaluateCatchAchievements(context: CatchEventContext): AwardCandidate[] {
  if (context.isTutorial) {
    return [];
  }
  const results: AwardCandidate[] = [];
  for (const rule of catchRules) {
    results.push(...rule.evaluate(context));
  }
  return results;
}
