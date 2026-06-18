export const PUSH_NOTIFICATION_TYPES = [
  'achievement_awarded',
  'convention_started',
  'convention_finalizing_started',
  'fursuit_caught',
  'catch_pending',
  'catch_confirmed',
  'catch_rejected',
  'catch_expired',
  'catch_invite_claimed',
  'catch_invite_approved',
  'catch_invite_declined',
  'catch_invite_reported',
  'daily_task_completed',
  'daily_all_complete',
  'convention_recap_ready',
] as const;

export const IN_APP_ONLY_NOTIFICATION_TYPES = ['daily_reset'] as const;

export const NOTIFICATION_TYPES = [
  ...PUSH_NOTIFICATION_TYPES,
  ...IN_APP_ONLY_NOTIFICATION_TYPES,
] as const;

export type PushNotificationType = (typeof PUSH_NOTIFICATION_TYPES)[number];
export type InAppOnlyNotificationType = (typeof IN_APP_ONLY_NOTIFICATION_TYPES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const PUSH_NOTIFICATION_TYPE_SET = new Set<string>(PUSH_NOTIFICATION_TYPES);
const IN_APP_ONLY_NOTIFICATION_TYPE_SET = new Set<string>(IN_APP_ONLY_NOTIFICATION_TYPES);
const NOTIFICATION_TYPE_SET = new Set<string>(NOTIFICATION_TYPES);

export function isPushNotificationType(value: unknown): value is PushNotificationType {
  return typeof value === 'string' && PUSH_NOTIFICATION_TYPE_SET.has(value);
}

export function isInAppOnlyNotificationType(value: unknown): value is InAppOnlyNotificationType {
  return typeof value === 'string' && IN_APP_ONLY_NOTIFICATION_TYPE_SET.has(value);
}

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && NOTIFICATION_TYPE_SET.has(value);
}
