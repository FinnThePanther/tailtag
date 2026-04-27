import { fail } from '@sveltejs/kit';
import { fetchConventions, fetchStaffAssignments } from '$lib/server/data';
import { addStaffAssignment, removeStaffAssignment } from '$lib/server/actions/staff';

export async function load() {
  const [assignments, conventions] = await Promise.all([
    fetchStaffAssignments(),
    fetchConventions(),
  ]);
  return { assignments, conventions };
}

export const actions = {
  add: async ({ cookies, request }) => {
    const form = await request.formData();
    try {
      await addStaffAssignment(cookies, {
        profileId: String(form.get('profileId') ?? ''),
        conventionId: String(form.get('conventionId') ?? ''),
        role: String(form.get('role') ?? 'staff') as 'staff' | 'organizer',
        status: String(form.get('status') ?? 'active') as 'active' | 'inactive',
        notes: String(form.get('notes') ?? '') || null,
      });
      return { message: 'Staff assignment saved.' };
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Unable to save assignment.',
      });
    }
  },
  remove: async ({ cookies, request }) => {
    const form = await request.formData();
    try {
      await removeStaffAssignment(cookies, {
        assignmentId: String(form.get('assignmentId') ?? ''),
        conventionId: String(form.get('conventionId') ?? ''),
      });
      return { message: 'Staff assignment removed.' };
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : 'Unable to remove assignment.',
      });
    }
  },
};
