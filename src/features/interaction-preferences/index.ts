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
} from './definitions';
export { InteractionPreferencesEditor } from './components/InteractionPreferencesEditor';
export { InteractionPreferencesSummary } from './components/InteractionPreferencesSummary';
export {
  hasDismissedInteractionPreferencesNudge,
  markInteractionPreferencesNudgeDismissed,
} from './storage';
