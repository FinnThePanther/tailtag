import { supabase } from '../../../lib/supabase';
import { ensureCurrentUserProfileExists } from '@/features/profile';
import type { Database } from '@/types/database';

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
    throw new Error(error.message);
  }

  return {
    token: data?.expo_push_token ?? null,
    enabled: data?.push_notifications_enabled === true,
  };
}

export async function registerPushToken(userId: string, token: string): Promise<void> {
  await ensureCurrentUserProfileExists(userId);

  const { error } = await supabase.rpc('register_push_token', {
    p_user_id: userId,
    p_expo_push_token: token,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updatePushPreference(userId: string, enabled: boolean): Promise<void> {
  await ensureCurrentUserProfileExists(userId);

  const payload: Database['public']['Tables']['profiles']['Update'] = {
    push_notifications_enabled: enabled,
    updated_at: new Date().toISOString(),
  };

  if (!enabled) {
    payload.expo_push_token = null;
  }

  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function clearPushToken(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: null, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markPushNotificationPrompted(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      push_notifications_prompted: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }
}
