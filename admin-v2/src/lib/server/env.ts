import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const env = {
  supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: privateEnv.SUPABASE_SERVICE_ROLE_KEY ?? '',
  mapboxAccessToken: privateEnv.MAPBOX_ACCESS_TOKEN ?? '',
  adminIsDevProject: privateEnv.ADMIN_IS_DEV_PROJECT === 'true',
  adminDevSupabaseProjectRef: privateEnv.ADMIN_DEV_SUPABASE_PROJECT_REF ?? 'rtxbvjicfxgcouufumce',
};

export function isDevSupabaseProject() {
  if (!env.adminIsDevProject) {
    return false;
  }

  return env.supabaseUrl.includes(env.adminDevSupabaseProjectRef);
}
