import { fail } from '@sveltejs/kit';
import { createConventionAction } from '$lib/server/actions/conventions';

export const actions = {
  create: async ({ cookies, request }) => {
    const form = await request.formData();
    try {
      await createConventionAction(cookies, {
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? ''),
        startDate: String(form.get('startDate') ?? '') || null,
        endDate: String(form.get('endDate') ?? '') || null,
        location: String(form.get('location') ?? '') || null,
        timezone: String(form.get('timezone') ?? 'UTC'),
        createDefaultGameplayPack: form.get('createDefaultGameplayPack') === 'on',
        startImmediately: form.get('startImmediately') === 'on',
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && 'location' in error)
        throw error;
      return fail(400, {
        error: error instanceof Error ? error.message : 'Unable to create convention.',
      });
    }
  },
};
