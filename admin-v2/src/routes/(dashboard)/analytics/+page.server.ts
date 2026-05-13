import { fail } from '@sveltejs/kit';
import {
  fetchAllConventionAnalytics,
  fetchCatchModeExperimentResults,
} from '$lib/server/analytics';
import { fetchConventions } from '$lib/server/data';
import { simulateCatchAction } from '$lib/server/actions/analytics';
import { requireAdminDataContext } from '$lib/server/auth';

export async function load({ cookies, setHeaders }) {
  const { supabase } = await requireAdminDataContext(cookies, undefined, setHeaders);
  const conventions = await fetchConventions(supabase);
  const [analytics, catchModeExperimentResults] = await Promise.all([
    fetchAllConventionAnalytics(
      supabase,
      conventions.map((c) => c.id),
    ),
    fetchCatchModeExperimentResults(supabase),
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
