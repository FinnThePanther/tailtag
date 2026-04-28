import { requireAdminProfile } from '$lib/server/auth';

export async function load({ cookies }) {
  const { profile } = await requireAdminProfile(cookies);
  return { profile };
}
