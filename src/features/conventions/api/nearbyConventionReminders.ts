import { supabase } from '@/lib/supabase';
import { captureNonCriticalError } from '@/lib/sentry';

export type NearbyConventionSetupReminderAction =
  | 'join_convention'
  | 'finish_check_in'
  | 'add_suit';

export type NearbyConventionSetupReminder = {
  conventionId: string;
  conventionName: string;
  distanceMeters: number | null;
  action: NearbyConventionSetupReminderAction;
  membershipState: string | null;
  ownedSuitCount: number;
  rosteredOwnedSuitCount: number;
};

type FetchNearbyConventionSetupReminderParams = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
};

function normalizeAction(value: unknown): NearbyConventionSetupReminderAction {
  switch (value) {
    case 'finish_check_in':
    case 'add_suit':
      return value;
    default:
      return 'join_convention';
  }
}

function mapReminderRow(row: any): NearbyConventionSetupReminder | null {
  if (!row?.convention_id || !row?.convention_name) {
    return null;
  }

  return {
    conventionId: row.convention_id,
    conventionName: row.convention_name,
    distanceMeters:
      typeof row.distance_meters === 'number' && Number.isFinite(row.distance_meters)
        ? row.distance_meters
        : null,
    action: normalizeAction(row.action),
    membershipState: typeof row.membership_state === 'string' ? row.membership_state : null,
    ownedSuitCount: Number(row.owned_suit_count ?? 0),
    rosteredOwnedSuitCount: Number(row.rostered_owned_suit_count ?? 0),
  };
}

export async function fetchNearbyConventionSetupReminder(
  params: FetchNearbyConventionSetupReminderParams,
): Promise<NearbyConventionSetupReminder | null> {
  const args: {
    p_lat: number;
    p_lng: number;
    p_accuracy_meters?: number;
  } = {
    p_lat: params.latitude,
    p_lng: params.longitude,
  };

  if (typeof params.accuracyMeters === 'number' && Number.isFinite(params.accuracyMeters)) {
    args.p_accuracy_meters = Math.max(0, Math.round(params.accuracyMeters));
  }

  const { data, error } = await supabase.rpc('get_nearby_convention_setup_reminder', {
    ...args,
  });

  if (error) {
    captureNonCriticalError(error, {
      scope: 'nearby-convention-reminders.fetch',
    });
    return null;
  }

  const [row] = Array.isArray(data) ? data : [];
  return mapReminderRow(row);
}

export async function markNearbyConventionSetupReminderShown(
  conventionId: string,
  source = 'foreground',
): Promise<void> {
  const { error } = await supabase.rpc('mark_nearby_convention_setup_reminder_shown', {
    p_convention_id: conventionId,
    p_source: source,
  });

  if (error) {
    captureNonCriticalError(error, {
      scope: 'nearby-convention-reminders.markShown',
      conventionId,
    });
  }
}

export async function dismissNearbyConventionSetupReminder(conventionId: string): Promise<void> {
  const { error } = await supabase.rpc('dismiss_nearby_convention_setup_reminder', {
    p_convention_id: conventionId,
  });

  if (error) {
    captureNonCriticalError(error, {
      scope: 'nearby-convention-reminders.dismiss',
      conventionId,
    });
  }
}

export async function markNearbyConventionSetupReminderActed(conventionId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_nearby_convention_setup_reminder_acted', {
    p_convention_id: conventionId,
  });

  if (error) {
    captureNonCriticalError(error, {
      scope: 'nearby-convention-reminders.markActed',
      conventionId,
    });
  }
}
