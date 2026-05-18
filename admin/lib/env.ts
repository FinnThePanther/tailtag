const required = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

export const env = {
  get supabaseUrl() {
    return required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return required(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  },
};

function getSupabaseProjectRef() {
  try {
    return new URL(env.supabaseUrl).hostname.split('.')[0] ?? null;
  } catch {
    return null;
  }
}

export function isDevSupabaseProject() {
  if (process.env.ADMIN_IS_DEV_PROJECT !== 'true') {
    return false;
  }

  const expectedProjectRef = process.env.ADMIN_DEV_SUPABASE_PROJECT_REF?.trim();
  if (!expectedProjectRef) {
    return false;
  }

  try {
    return getSupabaseProjectRef() === expectedProjectRef;
  } catch {
    return false;
  }
}

export function isRepairSupabaseProject() {
  const allowedProjectRefs = process.env.ADMIN_REPAIR_SUPABASE_PROJECT_REFS?.split(',')
    .map((ref) => ref.trim())
    .filter(Boolean);

  if (!allowedProjectRefs?.length) {
    return false;
  }

  const currentProjectRef = getSupabaseProjectRef();
  return Boolean(currentProjectRef && allowedProjectRefs.includes(currentProjectRef));
}
