import type { Json } from "../../types/database";

export type ImmediateAchievementAward = {
  achievementId: string | null;
  achievementKey: string;
  awardedAt: string | null;
  context: Json | null;
  sourceEventId: string | null;
};

type ImmediateAwardEvent = {
  userId: string;
  awards: ImmediateAchievementAward[];
};

type ImmediateAwardListener = (event: ImmediateAwardEvent) => void;

const listeners = new Set<ImmediateAwardListener>();

export function subscribeToImmediateAchievementAwards(listener: ImmediateAwardListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitImmediateAchievementAwards(event: ImmediateAwardEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[achievement-bus] listener error", error);
    }
  }
}
