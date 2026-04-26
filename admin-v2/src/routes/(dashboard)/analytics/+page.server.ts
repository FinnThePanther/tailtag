import { fail } from '@sveltejs/kit';
import { fetchAllConventionAnalytics } from '$lib/server/analytics';
import { fetchConventions } from '$lib/server/data';
import { simulateCatchAction } from '$lib/server/actions/analytics';

export async function load() {
  const conventions = await fetchConventions();
  const analytics = await fetchAllConventionAnalytics(conventions.map((c) => c.id));
  return {
    rows: conventions.map((convention) => ({
      ...convention,
      stats: analytics.find((entry) => entry.conventionId === convention.id),
    })),
  };
}

export const actions = {
  simulate: async ({ cookies, request }) => {
    const form = await request.formData();
    try {
      await simulateCatchAction(cookies, {
        conventionId: String(form.get('conventionId') ?? ''),
        catcherId: String(form.get('catcherId') ?? ''),
        fursuitId: String(form.get('fursuitId') ?? ''),
      });
      return { message: 'Catch simulated.' };
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Unable to simulate catch.',
      });
    }
  },
};
