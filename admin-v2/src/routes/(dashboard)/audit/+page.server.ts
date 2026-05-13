import { fetchAuditLogs } from '$lib/server/data';
import { requireAdminDataContext } from '$lib/server/auth';

export async function load({ cookies, setHeaders }) {
  const { supabase } = await requireAdminDataContext(cookies, undefined, setHeaders);
  return { logs: await fetchAuditLogs(supabase, 50) };
}
