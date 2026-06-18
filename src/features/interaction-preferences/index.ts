export {
  INTERACTION_BADGE_DEFINITIONS,
  INTERACTION_BADGE_GROUPS,
  INTERACTION_BADGE_KEYS,
  MAX_INTERACTION_BADGES,
  SOCIAL_SIGNAL_KEYS,
  SOCIAL_SIGNAL_OPTIONS,
  canToggleInteractionBadge,
  getInteractionBadgeDefinition,
  getInteractionPreferencesError,
  getSocialSignalDefinition,
  hasInteractionPreferences,
  normalizeInteractionBadges,
  normalizeSocialSignal,
  sortInteractionBadges,
  toggleInteractionBadge,
  type InteractionBadgeKey,
  type SocialSignalKey,
} from '@/features/interaction-preferences/definitions';
export { InteractionPreferencesEditor } from '@/features/interaction-preferences/components/InteractionPreferencesEditor';
export { InteractionPreferencesSummary } from '@/features/interaction-preferences/components/InteractionPreferencesSummary';
export {
  hasDismissedInteractionPreferencesNudge,
  markInteractionPreferencesNudgeDismissed,
} from '@/features/interaction-preferences/storage';
