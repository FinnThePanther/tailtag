import { createServerClient } from '@supabase/ssr';
import type { Cookies } from '@sveltejs/kit';

import { env } from '$lib/server/env';
import type { Database } from '$types/database';

export function createServerSupabaseClient(cookies: Cookies) {
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, { ...options, path: options.path ?? '/' });
        });
      },
    },
  });
}
