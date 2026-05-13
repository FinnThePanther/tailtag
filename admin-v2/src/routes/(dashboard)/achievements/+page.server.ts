import { fail } from '@sveltejs/kit';
import { fetchAchievements } from '$lib/server/data';
import { grantAchievementAction, revokeAchievementAction } from '$lib/server/actions/achievements';
import { requireAdminDataContext } from '$lib/server/auth';

export async function load({ cookies, setHeaders }) {
  const { supabase } = await requireAdminDataContext(cookies, undefined, setHeaders);
  return { achievements: await fetchAchievements(supabase) };
}

export const actions = {
  grant: async ({ cookies, request }) => {
    const form = await request.formData();
    try {
      await grantAchievementAction(cookies, {
        userId: String(form.get('userId') ?? ''),
        achievementId: String(form.get('achievementId') ?? ''),
      });
      return { message: 'Granted' };
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Unable to grant achievement.',
      });
    }
  },
  revoke: async ({ cookies, request }) => {
    const form = await request.formData();
    try {
      await revokeAchievementAction(cookies, {
        userId: String(form.get('userId') ?? ''),
        achievementId: String(form.get('achievementId') ?? ''),
      });
      return { message: 'Revoked' };
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Unable to revoke achievement.',
      });
    }
  },
};
