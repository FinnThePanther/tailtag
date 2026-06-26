import { supabase } from '@/lib/supabase';
import { captureSupabaseError } from '@/lib/sentry';
import type { Database } from '@/types/database';

export type NearbyConventionSetupReminderAction =
  | 'join_convention'
  | 'finish_check_in'
  | 'add_suit';

export interface NearbyConventionSetupReminder {
  conventionId: string;
  conventionName: string;
  distanceMeters: number | null;
  action: NearbyConventionSetupReminderAction;
  membershipState: string | null;
  ownedSuitCount: number;
  rosteredOwnedSuitCount: number;
}

interface FetchNearbyConventionSetupReminderParams {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
}

type NearbyConventionSetupReminderRow =
  Database['public']['Functions']['get_nearby_convention_setup_reminder']['Returns'][number];

function normalizeAction(value: unknown): NearbyConventionSetupReminderAction {
  switch (value) {
    case 'finish_check_in':
    case 'add_suit':
      return value;
    default:
      return 'join_convention';
  }
}

function mapReminderRow(
  row: NearbyConventionSetupReminderRow | undefined,
): NearbyConventionSetupReminder | null {
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
    captureSupabaseError(error, {
      scope: 'nearby-convention-reminders.fetch',
      action: 'get_nearby_convention_setup_reminder',
      rpc: 'get_nearby_convention_setup_reminder',
    });
    return null;
  }

  const [row] = Array.isArray(data) ? data : [];
  return mapReminderRow(row);
}

export async function markNearbyConventionSetupReminderShown(
  conventionId: string,
  action: NearbyConventionSetupReminderAction,
  source = 'foreground',
): Promise<void> {
  const { error } = await supabase.rpc('mark_nearby_convention_setup_reminder_shown', {
    p_action: action,
    p_convention_id: conventionId,
    p_source: source,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'nearby-convention-reminders.markShown',
      action: 'mark_nearby_convention_setup_reminder_shown',
      rpc: 'mark_nearby_convention_setup_reminder_shown',
      conventionId,
      reminderAction: action,
    });
  }
}

export async function dismissNearbyConventionSetupReminder(
  conventionId: string,
  action: NearbyConventionSetupReminderAction,
): Promise<void> {
  const { error } = await supabase.rpc('dismiss_nearby_convention_setup_reminder', {
    p_action: action,
    p_convention_id: conventionId,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'nearby-convention-reminders.dismiss',
      action: 'dismiss_nearby_convention_setup_reminder',
      rpc: 'dismiss_nearby_convention_setup_reminder',
      conventionId,
      reminderAction: action,
    });
  }
}

export async function markNearbyConventionSetupReminderActed(
  conventionId: string,
  action: NearbyConventionSetupReminderAction,
): Promise<void> {
  const { error } = await supabase.rpc('mark_nearby_convention_setup_reminder_acted', {
    p_action: action,
    p_convention_id: conventionId,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'nearby-convention-reminders.markActed',
      action: 'mark_nearby_convention_setup_reminder_acted',
      rpc: 'mark_nearby_convention_setup_reminder_acted',
      conventionId,
      reminderAction: action,
    });
  }
}
