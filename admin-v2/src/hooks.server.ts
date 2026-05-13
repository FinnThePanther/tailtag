import { json, redirect, type Handle, type RequestEvent } from '@sveltejs/kit';

import { createServerSupabaseClient } from '$lib/server/supabase/server';

const ADMIN_ROLES = new Set(['owner', 'organizer', 'staff', 'moderator']);
const PUBLIC_PATHS = new Set(['/login', '/api/geocode']);

export const handle: Handle = async ({ event, resolve }) => {
  const supabase = createServerSupabaseClient(event.cookies);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (isPublicPath(event.url.pathname)) {
    return resolve(event);
  }

  if (userError || !user) {
    return denyAdminRequest(event, 401, 'Authentication required');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !ADMIN_ROLES.has(String(profile.role))) {
    return denyAdminRequest(event, 403, 'Admin access required');
  }

  return resolve(event);
};

function denyAdminRequest(event: RequestEvent, status: 401 | 403, message: string) {
  if (expectsNonHtmlResponse(event)) {
    return json({ error: message }, { status });
  }

  throw redirect(303, status === 403 ? '/login?error=forbidden' : '/login');
}

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/_app/') ||
    (!pathname.startsWith('/api/') && /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname))
  );
}

function expectsNonHtmlResponse(event: RequestEvent) {
  const accept = event.request.headers.get('accept') ?? '';

  return (
    event.url.pathname.startsWith('/api/') ||
    event.isDataRequest ||
    accept.includes('application/json')
  );
}
