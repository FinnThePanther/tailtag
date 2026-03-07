import { redirect } from 'next/navigation';

import type { Database } from '@/types/database';
import { createServerSupabaseClient } from './supabase/server';

export type AdminRole = 'owner' | 'organizer' | 'staff' | 'moderator';
export const adminRoles: AdminRole[] = ['owner', 'organizer', 'staff', 'moderator'];

export type AdminProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'role' | 'is_suspended' | 'suspended_until'
> & { email?: string | null };

export async function getSessionWithProfile(): Promise<{
  session: Awaited<ReturnType<ReturnType<typeof createServerSupabaseClient>['auth']['getSession']>>['data']['session'];
  profile: AdminProfile | null;
}> {
  const supabase = createServerSupabaseClient();

  // getUser contacts Auth to validate the token instead of trusting local storage
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

  const email = user.email ?? null;

  return { session, profile: profile ? { ...profile, email } : null };
}

export async function requireAdminProfile(allowed: AdminRole[] = adminRoles) {
  const { session, profile } = await getSessionWithProfile();
  if (!session || !profile) {
    console.log('[auth] No session or profile — redirecting to /login', {
      hasSession: !!session,
      hasProfile: !!profile,
    });
    redirect('/login');
  }
  if (!allowed.includes(profile.role as AdminRole)) {
    console.log('[auth] Role not allowed — redirecting to /login', {
      role: profile.role,
      allowed,
    });
    redirect('/login?error=forbidden');
  }
  return { session, profile };
}

export async function assertAdminAction(allowed: AdminRole[] = adminRoles) {
  const { session, profile } = await getSessionWithProfile();
  if (!session || !profile) {
    throw new Error('You must be signed in to perform this action.');
  }
  if (!allowed.includes(profile.role as AdminRole)) {
    throw new Error('You do not have permission to perform this action.');
  }
  return { session, profile };
}
