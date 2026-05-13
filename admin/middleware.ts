import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { env } from './lib/env';

const ADMIN_ROLES = new Set(['owner', 'organizer', 'staff', 'moderator']);
const PUBLIC_PATHS = new Set(['/login', '/api/geocode']);

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const pathname = request.nextUrl.pathname;

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: Parameters<typeof response.cookies.set>[2]) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set(name, value, options);
      },
      remove(name: string, options: Parameters<typeof response.cookies.set>[2]) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set(name, '', { ...options, maxAge: 0 });
      },
    },
  });

  // Refresh the session so cookies stay in sync
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (isPublicPath(pathname)) {
    return response;
  }

  if (userError || !user) {
    return denyAdminRequest(request, response, 401, 'Authentication required');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !ADMIN_ROLES.has(String(profile.role))) {
    return denyAdminRequest(request, response, 403, 'Admin access required');
  }

  return response;
}

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}

function denyAdminRequest(
  request: NextRequest,
  response: NextResponse,
  status: 401 | 403,
  message: string,
) {
  if (expectsNonHtmlResponse(request)) {
    const jsonResponse = NextResponse.json({ error: message }, { status });
    copyResponseCookies(response, jsonResponse);
    return jsonResponse;
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = status === 403 ? '?error=forbidden' : '';
  const redirectResponse = NextResponse.redirect(loginUrl);
  copyResponseCookies(response, redirectResponse);
  return redirectResponse;
}

function expectsNonHtmlResponse(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const accept = request.headers.get('accept') ?? '';

  return (
    pathname.startsWith('/api/') ||
    request.headers.get('rsc') === '1' ||
    request.headers.has('next-router-prefetch') ||
    accept.includes('text/x-component') ||
    accept.includes('application/json')
  );
}

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
