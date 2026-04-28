import { fetchConventions, fetchDashboardSummary } from '$lib/server/data';

export async function load() {
  const [summary, conventions] = await Promise.all([fetchDashboardSummary(), fetchConventions()]);
  return { summary, conventions };
}
