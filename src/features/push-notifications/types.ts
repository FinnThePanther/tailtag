export type PushNotificationType =
  | 'achievement_awarded'
  | 'daily_all_complete'
  | 'catch_pending'
  | 'catch_confirmed'
  | 'catch_rejected'
  | 'catch_expired';

export const NOTIFICATION_DEEP_LINKS: Record<PushNotificationType, string> = {
  achievement_awarded: '/achievements',
  daily_all_complete: '/daily-tasks',
  catch_pending: '/suits',
  catch_confirmed: '/caught',
  catch_rejected: '/caught',
  catch_expired: '/suits',
};

export const isPushNotificationType = (value: unknown): value is PushNotificationType => {
  return typeof value === 'string' && value in NOTIFICATION_DEEP_LINKS;
};

export const getDeepLinkForNotificationType = (value: unknown): string | null => {
  if (!isPushNotificationType(value)) {
    return null;
  }

  return NOTIFICATION_DEEP_LINKS[value];
};
