// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions run in Deno.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import type { InsertableEventRow } from './types.ts';

type CatchNotificationType = 'catch_pending' | 'fursuit_caught';

type CatchNotificationContext = {
  catchId: string;
  catcherId: string;
  fursuitId: string;
  fursuitOwnerId: string;
  fursuitName: string | null;
  catcherUsername: string | null;
  conventionId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

async function loadCatchNotificationContext(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  event: InsertableEventRow,
): Promise<CatchNotificationContext | null> {
  const payload = isRecord(event.payload) ? event.payload : {};
  const catchId = readString(payload.catch_id);
  const fursuitId = readString(payload.fursuit_id);
  const catcherId = readString(payload.catcher_id) ?? event.user_id;
  const fursuitOwnerId = readString(payload.fursuit_owner_id);
  const conventionId = readString(payload.convention_id) ?? event.convention_id;

  if (!catchId || !fursuitId || !catcherId || !fursuitOwnerId) {
    console.error('[catchNotifications] Missing catch notification payload fields', {
      event_id: event.event_id,
      type: event.type,
      payload,
    });
    return null;
  }

  const [fursuitResult, catcherResult] = await Promise.all([
    supabaseAdmin.from('fursuits').select('name').eq('id', fursuitId).maybeSingle(),
    supabaseAdmin.from('profiles').select('username').eq('id', catcherId).maybeSingle(),
  ]);

  if (fursuitResult.error) {
    console.error('[catchNotifications] Failed loading fursuit notification metadata', {
      event_id: event.event_id,
      fursuit_id: fursuitId,
      error: fursuitResult.error.message,
    });
    return null;
  }

  if (catcherResult.error) {
    console.error('[catchNotifications] Failed loading catcher notification metadata', {
      event_id: event.event_id,
      catcher_id: catcherId,
      error: catcherResult.error.message,
    });
    return null;
  }

  const [canOwnerViewFursuitResult, canOwnerViewCatcherResult] = await Promise.all([
    supabaseAdmin.rpc('can_view_fursuit_as_profile', {
      p_viewer_id: fursuitOwnerId,
      p_fursuit_id: fursuitId,
    }),
    supabaseAdmin.rpc('can_view_profile_as_profile', {
      p_viewer_id: fursuitOwnerId,
      p_target_id: catcherId,
    }),
  ]);

  if (canOwnerViewFursuitResult.error) {
    console.error('[catchNotifications] Failed checking fursuit notification visibility', {
      event_id: event.event_id,
      fursuit_id: fursuitId,
      error: canOwnerViewFursuitResult.error.message,
    });
  }

  if (canOwnerViewCatcherResult.error) {
    console.error('[catchNotifications] Failed checking catcher notification visibility', {
      event_id: event.event_id,
      catcher_id: catcherId,
      error: canOwnerViewCatcherResult.error.message,
    });
  }

  const canOwnerViewFursuit = canOwnerViewFursuitResult.data === true;
  const canOwnerViewCatcher = canOwnerViewCatcherResult.data === true;

  return {
    catchId,
    catcherId,
    fursuitId,
    fursuitOwnerId,
    fursuitName: canOwnerViewFursuit
      ? ((fursuitResult.data as { name?: string } | null)?.name ?? null)
      : null,
    catcherUsername: canOwnerViewCatcher
      ? ((catcherResult.data as { username?: string } | null)?.username ?? null)
      : null,
    conventionId,
  };
}

async function insertCatchNotification(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  type: CatchNotificationType,
  context: CatchNotificationContext,
): Promise<void> {
  const payload =
    type === 'catch_pending'
      ? {
          adult_boundary_checked: true,
          catch_id: context.catchId,
          catcher_id: context.catcherId,
          recipient_role: 'owner',
          ...(context.fursuitName ? { fursuit_name: context.fursuitName } : {}),
          ...(context.catcherUsername ? { catcher_username: context.catcherUsername } : {}),
        }
      : {
          adult_boundary_checked: true,
          catch_id: context.catchId,
          catcher_id: context.catcherId,
          fursuit_id: context.fursuitId,
          recipient_role: 'owner',
          ...(context.fursuitName ? { fursuit_name: context.fursuitName } : {}),
          ...(context.catcherUsername ? { catcher_username: context.catcherUsername } : {}),
          convention_id: context.conventionId,
        };

  const { error } = await supabaseAdmin.rpc('insert_catch_notification_once', {
    p_user_id: context.fursuitOwnerId,
    p_type: type,
    p_payload: payload,
  });

  if (error) {
    console.error('[catchNotifications] Failed inserting deduped catch notification', {
      type,
      catch_id: context.catchId,
      user_id: context.fursuitOwnerId,
      error: error.message,
    });
  }
}

export async function processCatchNotificationForEvent(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  event: InsertableEventRow,
): Promise<void> {
  if (event.type !== 'catch_pending' && event.type !== 'catch_performed') {
    return;
  }

  const payload = isRecord(event.payload) ? event.payload : {};

  if (event.type === 'catch_performed') {
    if (readString(payload.source) === 'catch_confirmed') {
      return;
    }
  }

  const context = await loadCatchNotificationContext(supabaseAdmin, event);
  if (!context) {
    return;
  }

  await insertCatchNotification(
    supabaseAdmin,
    event.type === 'catch_pending' ? 'catch_pending' : 'fursuit_caught',
    context,
  );
}
