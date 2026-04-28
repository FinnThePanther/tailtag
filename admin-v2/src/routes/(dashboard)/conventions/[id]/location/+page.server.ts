import { error, fail } from '@sveltejs/kit';
import { fetchConvention } from '$lib/server/data';
import { updateConventionGeofenceAction } from '$lib/server/actions/conventions';

export async function load({ params }) {
  const { convention } = await fetchConvention(params.id);
  if (!convention) throw error(404, 'Convention not found');
  return { convention };
}

export const actions = {
  save: async ({ cookies, params, request }) => {
    const form = await request.formData();
    try {
      await updateConventionGeofenceAction(cookies, {
        conventionId: params.id,
        latitude: form.get('latitude') ? Number(form.get('latitude')) : null,
        longitude: form.get('longitude') ? Number(form.get('longitude')) : null,
        radiusMeters: Number(form.get('radiusMeters') ?? 500),
        geofenceEnabled: form.get('geofenceEnabled') === 'on',
      });
      return { message: 'Geofence saved.' };
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Unable to save geofence.',
      });
    }
  },
};
