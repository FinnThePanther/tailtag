const required = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

export const env = {
  supabaseUrl: required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: required(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

export function isDevSupabaseProject() {
  if (process.env.ADMIN_IS_DEV_PROJECT !== 'true') {
    return false;
  }

  const expectedProjectRef = process.env.ADMIN_DEV_SUPABASE_PROJECT_REF?.trim();
  if (!expectedProjectRef) {
    return false;
  }

  try {
    return new URL(env.supabaseUrl).hostname === `${expectedProjectRef}.supabase.co`;
  } catch {
    return false;
  }
}
