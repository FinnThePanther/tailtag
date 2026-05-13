import { fetchConventions, fetchPlayerSearch } from '$lib/server/data';
import { requireAdminDataContext } from '$lib/server/auth';
import type { Database } from '$types/database';

export async function load({ cookies, setHeaders, url }) {
  const { supabase } = await requireAdminDataContext(cookies, undefined, setHeaders);
  const page = Number(url.searchParams.get('page') ?? '1') || 1;
  const suspended = url.searchParams.get('suspended');
  const params = {
    q: url.searchParams.get('q') ?? '',
    role: (url.searchParams.get('role') ?? '') as Database['public']['Enums']['user_role'] | '',
    suspended: suspended as 'true' | 'false' | null,
    conventionId: url.searchParams.get('conventionId') ?? '',
  };
  const [players, conventions] = await Promise.all([
    fetchPlayerSearch(supabase, {
      search: params.q || undefined,
      role: params.role || null,
      conventionId: params.conventionId || null,
      isSuspended: suspended === null ? null : suspended === 'true',
      page,
      pageSize: 20,
    }),
    fetchConventions(supabase),
  ]);

  return { players, conventions, params };
}
