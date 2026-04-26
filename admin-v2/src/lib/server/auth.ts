import { redirect, type Cookies } from '@sveltejs/kit';

import type { Database } from '$types/database';
import { createServerSupabaseClient } from '$lib/server/supabase/server';

export type AdminRole = 'owner' | 'organizer' | 'staff' | 'moderator';
export const adminRoles: AdminRole[] = ['owner', 'organizer', 'staff', 'moderator'];

export type AdminProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'role' | 'is_suspended' | 'suspended_until'
> & { email?: string | null };

export async function getSessionWithProfile(cookies: Cookies): Promise<{
  session: Awaited<
    ReturnType<ReturnType<typeof createServerSupabaseClient>['auth']['getSession']>
  >['data']['session'];
  profile: AdminProfile | null;
}> {
  const supabase = createServerSupabaseClient(cookies);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { session: null, profile: null };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, role, is_suspended, suspended_until')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.log('[auth] Profile query error:', profileError);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return {
    session,
    profile: profile ? { ...profile, email: user.email ?? null } : null,
  };
}

export async function requireAdminProfile(cookies: Cookies, allowed: AdminRole[] = adminRoles) {
  const { session, profile } = await getSessionWithProfile(cookies);
  if (!session || !profile) {
    throw redirect(303, '/login');
  }
  if (!allowed.includes(profile.role as AdminRole)) {
    throw redirect(303, '/login?error=forbidden');
  }
  return { session, profile };
}

export async function assertAdminAction(cookies: Cookies, allowed: AdminRole[] = adminRoles) {
  const { session, profile } = await getSessionWithProfile(cookies);
  if (!session || !profile) {
    throw new Error('You must be signed in to perform this action.');
  }
  if (!allowed.includes(profile.role as AdminRole)) {
    throw new Error('You do not have permission to perform this action.');
  }
  return { session, profile };
}
