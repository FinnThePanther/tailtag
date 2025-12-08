import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import { env } from '../env';
import type { Database } from '@/types/database';

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  const safeSet =
    typeof cookieStore.set === 'function'
      ? (
          name: string,
          value: string,
          options: Parameters<(typeof cookieStore)['set']>[2]
        ) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // In RSC, cookies are read-only; ignore write attempts to avoid runtime errors.
          }
        }
      : () => {};
  const safeRemove =
    typeof cookieStore.set === 'function'
      ? (
          name: string,
          options: Parameters<(typeof cookieStore)['set']>[2]
        ) => {
          try {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          } catch {
            // Ignore in read-only contexts.
          }
        }
      : () => {};

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set: safeSet,
      remove: safeRemove,
    },
  });
}
