import { buildConventionLifecycleHealthList } from '$lib/server/convention-lifecycle';
import { fetchConventions } from '$lib/server/data';
import { requireAdminDataContext } from '$lib/server/auth';

export async function load({ cookies, setHeaders }) {
  const { supabase } = await requireAdminDataContext(cookies, undefined, setHeaders);
  const conventions = await fetchConventions(supabase);
  const healthByConvention = await buildConventionLifecycleHealthList(conventions, supabase);
  return {
    conventions,
    healthEntries: Array.from(healthByConvention.entries()),
  };
}
