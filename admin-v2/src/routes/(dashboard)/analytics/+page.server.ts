import { fail } from '@sveltejs/kit';
import {
  fetchAllConventionAnalytics,
  fetchCatchModeExperimentResults,
} from '$lib/server/analytics';
import { fetchConventions } from '$lib/server/data';
import { simulateCatchAction } from '$lib/server/actions/analytics';

export async function load() {
  const conventions = await fetchConventions();
  const [analytics, catchModeExperimentResults] = await Promise.all([
    fetchAllConventionAnalytics(conventions.map((c) => c.id)),
    fetchCatchModeExperimentResults(),
  ]);

  return {
    rows: conventions.map((convention) => ({
      ...convention,
      stats: analytics.find((entry) => entry.conventionId === convention.id),
    })),
    catchModeExperimentResults,
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
      return { message: 'Simulated catch created.' };
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Unable to simulate catch.',
      });
    }
  },
};
