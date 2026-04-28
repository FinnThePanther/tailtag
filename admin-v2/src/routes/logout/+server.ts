import { redirect } from '@sveltejs/kit';
import { createServerSupabaseClient } from '$lib/server/supabase/server';

export async function POST({ cookies }) {
  const supabase = createServerSupabaseClient(cookies);
  await supabase.auth.signOut();
  throw redirect(303, '/login');
}
