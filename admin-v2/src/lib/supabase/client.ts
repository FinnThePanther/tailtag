import { createBrowserClient } from '@supabase/ssr';
import { env } from '$env/dynamic/public';

import type { Database } from '$types/database';

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  );
}
