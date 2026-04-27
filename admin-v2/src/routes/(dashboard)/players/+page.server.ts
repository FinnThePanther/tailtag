import { fetchConventions, fetchPlayerSearch } from '$lib/server/data';
import type { Database } from '$types/database';

export async function load({ url }) {
  const page = Number(url.searchParams.get('page') ?? '1') || 1;
  const suspended = url.searchParams.get('suspended');
  const params = {
    q: url.searchParams.get('q') ?? '',
    role: (url.searchParams.get('role') ?? '') as Database['public']['Enums']['user_role'] | '',
    suspended: suspended as 'true' | 'false' | null,
    conventionId: url.searchParams.get('conventionId') ?? '',
  };
  const [players, conventions] = await Promise.all([
    fetchPlayerSearch({
      search: params.q || undefined,
      role: params.role || null,
      conventionId: params.conventionId || null,
      isSuspended: suspended === null ? null : suspended === 'true',
      page,
      pageSize: 20,
    }),
    fetchConventions(),
  ]);

  return { players, conventions, params };
}
