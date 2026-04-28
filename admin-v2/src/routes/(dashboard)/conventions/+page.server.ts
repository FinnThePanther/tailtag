import { buildConventionLifecycleHealthList } from '$lib/server/convention-lifecycle';
import { fetchConventions } from '$lib/server/data';
import { createServiceRoleClient } from '$lib/server/supabase/service';

export async function load() {
  const conventions = await fetchConventions();
  const healthByConvention = await buildConventionLifecycleHealthList(
    conventions,
    createServiceRoleClient(),
  );
  return {
    conventions,
    healthEntries: Array.from(healthByConvention.entries()),
  };
}
