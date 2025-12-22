import { supabase } from '../../../lib/supabase';
import { captureSupabaseError } from '../../../lib/sentry';

type PushSettings = {
  token: string | null;
  enabled: boolean;
};

export async function fetchPushSettings(userId: string): Promise<PushSettings> {
  const { data, error } = await supabase
    .from('profiles')
    .select('expo_push_token, push_notifications_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    captureSupabaseError(error, {
      scope: 'push-notifications.fetchPushSettings',
      action: 'select',
      userId,
    });
    throw new Error(error.message);
  }

  return {
    token: data?.expo_push_token ?? null,
    enabled: data?.push_notifications_enabled === true,
  };
}

export async function registerPushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      expo_push_token: token,
      push_notifications_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    captureSupabaseError(error, {
      scope: 'push-notifications.registerPushToken',
      action: 'update',
      userId,
    });
    throw new Error(error.message);
  }
}

export async function updatePushPreference(userId: string, enabled: boolean): Promise<void> {
  const payload: Record<string, unknown> = {
    push_notifications_enabled: enabled,
    updated_at: new Date().toISOString(),
  };

  if (!enabled) {
    payload.expo_push_token = null;
  }

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId);

  if (error) {
    captureSupabaseError(error, {
      scope: 'push-notifications.updatePushPreference',
      action: 'update',
      userId,
    });
    throw new Error(error.message);
  }
}

export async function clearPushToken(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: null, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    captureSupabaseError(error, {
      scope: 'push-notifications.clearPushToken',
      action: 'update',
      userId,
    });
    throw new Error(error.message);
  }
}
