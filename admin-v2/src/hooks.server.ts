import type { Handle } from '@sveltejs/kit';

import { createServerSupabaseClient } from '$lib/server/supabase/server';

export const handle: Handle = async ({ event, resolve }) => {
  const supabase = createServerSupabaseClient(event.cookies);
  await supabase.auth.getUser();
  return resolve(event);
};
