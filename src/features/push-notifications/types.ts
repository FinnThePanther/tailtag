import {
  isPushNotificationType as isContractPushNotificationType,
  type PushNotificationType,
} from '../../../packages/notification-contract/src';

export type { PushNotificationType };

type StaticPushNotificationType = Exclude<PushNotificationType, 'convention_recap_ready'>;

export type PushNotificationData = {
  type?: unknown;
  notification_id?: unknown;
  recipient_role?: unknown;
  recap_id?: unknown;
  catch_id?: unknown;
};

export const NOTIFICATION_DEEP_LINKS: Record<StaticPushNotificationType, string> = {
  achievement_awarded: '/achievements',
  convention_started: '/catch',
  convention_finalizing_started: '/catch',
  daily_task_completed: '/daily-tasks',
  daily_all_complete: '/daily-tasks',
  fursuit_caught: '/suits',
  catch_pending: '/suits',
  catch_confirmed: '/caught',
  catch_rejected: '/caught',
  catch_expired: '/suits',
  catch_invite_claimed: '/caught',
  catch_invite_approved: '/caught',
  catch_invite_declined: '/caught',
  catch_invite_reported: '/caught',
};

export const isPushNotificationType = (value: unknown): value is PushNotificationType => {
  return isContractPushNotificationType(value);
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

  if (type === 'catch_invite_approved') {
    const catchId = data?.catch_id;
    const normalizedCatchId = typeof catchId === 'string' ? catchId.trim() : '';
    if (normalizedCatchId) {
      return `/catches/${encodeURIComponent(normalizedCatchId)}`;
    }
  }

  return getDeepLinkForNotificationType(type);
};
