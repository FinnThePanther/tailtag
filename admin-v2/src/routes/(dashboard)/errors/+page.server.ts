import { fetchAdminErrors } from '$lib/server/data';

export async function load() {
  return { errors: await fetchAdminErrors(50) };
}
