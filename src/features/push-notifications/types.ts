export type PushNotificationType =
  | 'achievement_awarded'
  | 'convention_started'
  | 'convention_finalizing_started'
  | 'convention_recap_ready'
  | 'daily_all_complete'
  | 'fursuit_caught'
  | 'catch_pending'
  | 'catch_confirmed'
  | 'catch_rejected'
  | 'catch_expired';

type StaticPushNotificationType = Exclude<PushNotificationType, 'convention_recap_ready'>;

export type PushNotificationData = {
  type?: unknown;
  notification_id?: unknown;
  recipient_role?: unknown;
  recap_id?: unknown;
};

export const NOTIFICATION_DEEP_LINKS: Record<StaticPushNotificationType, string> = {
  achievement_awarded: '/achievements',
  convention_started: '/catch',
  convention_finalizing_started: '/catch',
  daily_all_complete: '/daily-tasks',
  fursuit_caught: '/suits',
  catch_pending: '/suits',
  catch_confirmed: '/caught',
  catch_rejected: '/caught',
  catch_expired: '/suits',
};

export const isPushNotificationType = (value: unknown): value is PushNotificationType => {
  return (
    typeof value === 'string' &&
    (value === 'convention_recap_ready' || value in NOTIFICATION_DEEP_LINKS)
  );
};

export const getDeepLinkForNotificationType = (value: unknown): string | null => {
  if (!isPushNotificationType(value) || value === 'convention_recap_ready') {
    return null;
  }

  return NOTIFICATION_DEEP_LINKS[value];
};

export const getDeepLinkForNotificationData = (
  data: PushNotificationData | null | undefined,
): string | null => {
  const type = data?.type;

  if (type === 'catch_expired') {
    return data?.recipient_role === 'catcher' ? '/caught' : '/suits';
  }

  if (type === 'convention_recap_ready') {
    const recapId = data?.recap_id;
    const normalizedRecapId = typeof recapId === 'string' ? recapId.trim() : '';
    if (!normalizedRecapId) {
      return null;
    }

    return `/convention-recaps/${encodeURIComponent(normalizedRecapId)}`;
  }

  return getDeepLinkForNotificationType(type);
};
