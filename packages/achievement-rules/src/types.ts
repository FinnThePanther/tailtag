export type GameEventType =
  | "catch_performed"
  | "profile_updated"
  | "onboarding_completed"
  | "convention_joined";

export type ResetMode = "none" | "daily" | "rolling" | "windowed";

export type AwardContext = Record<string, unknown>;

export interface AwardCandidate {
  ruleId?: string;
  achievementKey: string;
  userId: string;
  context: AwardContext;
  windowKey?: string;
}

export interface RuleMetadata {
  displayName: string;
  description?: string;
  category: "catching" | "variety" | "dedication" | "fursuiter" | "fun" | "meta";
  recipientRole: "catcher" | "fursuit_owner" | "any";
  canEvaluateClient: boolean;
  resetMode: ResetMode;
  tags?: string[];
}

export interface BaseRuleDefinition<TContext> {
  ruleId: string;
  achievementKey: string;
  eventType: GameEventType;
  metadata: RuleMetadata;
  requiredStats: string[];
  evaluate(context: TContext): AwardCandidate[];
}

export interface ConventionInfo {
  id?: string | null;
  timezone?: string | null;
  startDate?: string | null;
}

export interface CatchEventContext {
  eventId: string;
  occurredAt: string;
  catchId: string;
  catcherId: string;
  actingUserId: string;
  fursuitId: string;
  fursuitOwnerId?: string | null;
  conventionId?: string | null;
  conventionInfo?: ConventionInfo | null;
  isTutorial: boolean;
  timing: {
    isConventionDayOne: boolean;
    isLateNight: boolean;
    isEarlyMorning: boolean;
  };
  stats: {
    totalCatches: number;
    totalFursuitCatches: number;
    distinctSpeciesCaught: number;
    distinctConventionsVisited: number;
    catchesAtConvention: number;
    uniqueCatchersAtConvention: number;
    uniqueCatchersForFursuitLifetime: number;
    distinctLocalDaysForFursuitAtConvention: number;
    distinctConventionsForFursuit: number;
    catchesByCatcherToday: number;
  };
  flags: {
    hybridFursuit: boolean;
    doubleCatchWithinMinute: boolean;
    catchHasPhoto: boolean;
  };
}

export interface ProfileSnapshot {
  hasUsername: boolean;
  hasBio: boolean;
}

export interface ProfileEventContext {
  eventId: string;
  occurredAt: string;
  userId: string;
  profile: ProfileSnapshot;
}

export interface SimpleEventContext {
  eventId: string;
  occurredAt: string;
  userId: string;
  conventionId?: string | null;
}

export type CatchRuleDefinition = BaseRuleDefinition<CatchEventContext>;
export type ProfileRuleDefinition = BaseRuleDefinition<ProfileEventContext>;
export type SimpleRuleDefinition = BaseRuleDefinition<SimpleEventContext>;
