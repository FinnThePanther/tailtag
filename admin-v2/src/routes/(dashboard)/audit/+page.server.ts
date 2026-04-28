import { fetchAuditLogs } from '$lib/server/data';

export async function load() {
  return { logs: await fetchAuditLogs(50) };
}
