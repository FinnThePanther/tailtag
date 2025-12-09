import { createBrowserClient } from '@supabase/ssr';

import { env } from '../env';
import type { Database } from '@/types/database';

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
