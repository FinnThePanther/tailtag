import { createClient } from '@supabase/supabase-js';

import { env } from '$lib/server/env';
import type { Database } from '$types/database';

export function createServiceRoleClient() {
  if (!env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server actions.');
  }

  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
