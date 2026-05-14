// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions run in Deno.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import type { InsertableEventRow } from './types.ts';

type CatchNotificationType = 'catch_pending' | 'fursuit_caught';

type CatchNotificationContext = {
  catchId: string;
  catcherId: string;
  fursuitId: string;
  fursuitOwnerId: string;
  fursuitName: string;
  catcherUsername: string;
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

async function notificationExists(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  options: {
    userId: string;
    type: CatchNotificationType;
    catchId: string;
  },
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .eq('user_id', options.userId)
    .eq('type', options.type)
    .contains('payload', { catch_id: options.catchId })
    .limit(1);

  if (error) {
    throw new Error(`Failed checking existing catch notification: ${error.message}`);
  }

  return (data ?? []).length > 0;
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
    throw new Error(`Failed loading fursuit notification metadata: ${fursuitResult.error.message}`);
  }

  if (catcherResult.error) {
    throw new Error(`Failed loading catcher notification metadata: ${catcherResult.error.message}`);
  }

  return {
    catchId,
    catcherId,
    fursuitId,
    fursuitOwnerId,
    fursuitName: (fursuitResult.data as { name?: string } | null)?.name ?? 'Unknown Fursuit',
    catcherUsername: (catcherResult.data as { username?: string } | null)?.username ?? 'Someone',
    conventionId,
  };
}

async function insertCatchNotification(
  supabaseAdmin: SupabaseClient<any, 'public', any>,
  type: CatchNotificationType,
  context: CatchNotificationContext,
): Promise<void> {
  const exists = await notificationExists(supabaseAdmin, {
    userId: context.fursuitOwnerId,
    type,
    catchId: context.catchId,
  });

  if (exists) {
    return;
  }

  const payload =
    type === 'catch_pending'
      ? {
          catch_id: context.catchId,
          catcher_id: context.catcherId,
          fursuit_name: context.fursuitName,
          catcher_username: context.catcherUsername,
        }
      : {
          catch_id: context.catchId,
          catcher_id: context.catcherId,
          fursuit_id: context.fursuitId,
          fursuit_name: context.fursuitName,
          catcher_username: context.catcherUsername,
          convention_id: context.conventionId,
        };

  const { error } = await supabaseAdmin.from('notifications').insert({
    user_id: context.fursuitOwnerId,
    type,
    payload,
  });

  if (error) {
    throw new Error(`Failed inserting ${type} notification: ${error.message}`);
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
    if (readBoolean(payload.is_tutorial) || readString(payload.source) === 'catch_confirmed') {
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
