import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const env = {
  supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: privateEnv.SUPABASE_SERVICE_ROLE_KEY ?? '',
  mapboxAccessToken: privateEnv.MAPBOX_ACCESS_TOKEN ?? '',
  adminIsDevProject: privateEnv.ADMIN_IS_DEV_PROJECT === 'true',
  adminDevSupabaseProjectRef: privateEnv.ADMIN_DEV_SUPABASE_PROJECT_REF ?? 'rtxbvjicfxgcouufumce',
  adminRepairSupabaseProjectRefs:
    privateEnv.ADMIN_REPAIR_SUPABASE_PROJECT_REFS ?? 'rtxbvjicfxgcouufumce',
};

function getSupabaseProjectRef() {
  try {
    return new URL(env.supabaseUrl).hostname.split('.')[0] ?? null;
  } catch {
    return null;
  }
}

export function isDevSupabaseProject() {
  if (!env.adminIsDevProject) {
    return false;
  }

  return getSupabaseProjectRef() === env.adminDevSupabaseProjectRef;
}

export function isRepairSupabaseProject() {
  const allowedProjectRefs = env.adminRepairSupabaseProjectRefs
    .split(',')
    .map((ref) => ref.trim())
    .filter(Boolean);
  const currentProjectRef = getSupabaseProjectRef();
  return Boolean(currentProjectRef && allowedProjectRefs.includes(currentProjectRef));
}
