import { fetchConventions, fetchDashboardSummary } from '$lib/server/data';
import { requireAdminDataContext } from '$lib/server/auth';

export async function load({ cookies, setHeaders }) {
  const { supabase } = await requireAdminDataContext(cookies, undefined, setHeaders);
  const [summary, conventions] = await Promise.all([
    fetchDashboardSummary(supabase),
    fetchConventions(supabase),
  ]);
  return { summary, conventions };
}
