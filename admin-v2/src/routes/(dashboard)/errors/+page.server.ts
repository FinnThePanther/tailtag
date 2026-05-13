import { fetchAdminErrors } from '$lib/server/data';
import { requireAdminDataContext } from '$lib/server/auth';

export async function load({ cookies, setHeaders }) {
  const { supabase } = await requireAdminDataContext(cookies, undefined, setHeaders);
  return { errors: await fetchAdminErrors(supabase, 50) };
}
