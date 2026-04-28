import { fail } from '@sveltejs/kit';
import { fetchConventions, fetchReports } from '$lib/server/data';
import { resolveReportAction } from '$lib/server/actions/reports';

export async function load({ url }) {
  const params = {
    status: url.searchParams.get('status') ?? '',
    severity: url.searchParams.get('severity') ?? '',
    conventionId: url.searchParams.get('conventionId') ?? '',
  };
  const [reports, conventions] = await Promise.all([
    fetchReports({
      status: params.status || undefined,
      severity: params.severity || undefined,
      conventionId: params.conventionId || undefined,
    }),
    fetchConventions(),
  ]);
  return { reports, conventions, params };
}

export const actions = {
  resolve: async ({ cookies, request }) => {
    const form = await request.formData();
    try {
      await resolveReportAction(cookies, {
        reportId: String(form.get('reportId') ?? ''),
        status: String(form.get('status') ?? 'resolved') as 'resolved' | 'dismissed',
        resolutionNotes: String(form.get('resolutionNotes') ?? '') || null,
      });
      return { message: 'Report updated.' };
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Unable to update report.',
      });
    }
  },
};
