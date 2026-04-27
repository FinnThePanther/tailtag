import { error, fail } from '@sveltejs/kit';
import { fetchConventions, fetchPlayerProfile, fetchUserBlocks } from '$lib/server/data';
import { banUserAction, unbanUserAction } from '$lib/server/actions/players';

export async function load({ params }) {
  const [{ profile, moderationSummary, actions }, conventions, blocks] = await Promise.all([
    fetchPlayerProfile(params.id),
    fetchConventions(),
    fetchUserBlocks(params.id),
  ]);

  if (!profile) {
    throw error(404, 'Player not found');
  }

  return { profile, moderationSummary, actions, conventions, blocks };
}

export const actions = {
  ban: async ({ cookies, params, request }) => {
    const form = await request.formData();
    try {
      await banUserAction(cookies, {
        userId: params.id,
        reason: String(form.get('reason') || 'Admin ban'),
        durationHours: form.get('durationHours') ? Number(form.get('durationHours')) : null,
        scope: String(form.get('scope') || 'global') as 'global' | 'event',
        conventionId: form.get('scope') === 'event' ? String(form.get('conventionId') || '') : null,
      });
      return { message: 'Ban applied' };
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Unable to apply ban.' });
    }
  },
  unban: async ({ cookies, params }) => {
    try {
      await unbanUserAction(cookies, { userId: params.id, reason: 'Lifted via admin' });
      return { message: 'Ban lifted' };
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Unable to lift ban.' });
    }
  },
};
