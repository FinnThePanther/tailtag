import { error, fail } from '@sveltejs/kit';
import {
  buildConventionLifecycleHealth,
  buildConventionReadiness,
} from '$lib/server/convention-lifecycle';
import {
  fetchConvention,
  fetchConventionAchievements,
  fetchConventionTasks,
} from '$lib/server/data';
import { isDevSupabaseProject } from '$lib/server/env';
import { createServiceRoleClient } from '$lib/server/supabase/service';
import {
  closeConventionAction,
  createConventionAchievementAction,
  createConventionTaskAction,
  deleteArchivedConventionInDevAction,
  deleteConventionAchievementAction,
  deleteConventionTaskAction,
  generateConventionGameplayPackAction,
  regenerateConventionRecapsAction,
  retryConventionCloseoutAction,
  rotateConventionDailiesAction,
  runConventionReadinessCheckAction,
  startConventionAction,
  toggleConventionAchievementAction,
  toggleConventionTaskAction,
  updateConventionConfigAction,
  updateConventionDetailsAction,
} from '$lib/server/actions/conventions';

export async function load({ params, url }) {
  const { convention, staff } = await fetchConvention(params.id);
  if (!convention) throw error(404, 'Convention not found');
  const supabase = createServiceRoleClient();
  const [tasks, achievements, readiness, health] = await Promise.all([
    fetchConventionTasks(params.id),
    fetchConventionAchievements(params.id),
    buildConventionReadiness(convention, supabase),
    buildConventionLifecycleHealth(convention, supabase),
  ]);
  return {
    convention,
    staff,
    tasks,
    achievements,
    readiness,
    health,
    showDevDelete: isDevSupabaseProject(),
    startSkipped: url.searchParams.get('startSkipped'),
  };
}

const ok = async (run: () => Promise<unknown>, message: string) => {
  try {
    await run();
    return { message };
  } catch (error) {
    return fail(400, { error: error instanceof Error ? error.message : 'Action failed.' });
  }
};

export const actions = {
  details: async ({ cookies, params, request }) => {
    const form = await request.formData();
    return ok(
      () =>
        updateConventionDetailsAction(cookies, {
          conventionId: params.id,
          name: String(form.get('name') ?? ''),
          slug: String(form.get('slug') ?? ''),
          startDate: String(form.get('startDate') ?? '') || null,
          endDate: String(form.get('endDate') ?? '') || null,
          location: String(form.get('location') ?? '') || null,
          timezone: String(form.get('timezone') ?? 'UTC'),
        }),
      'Convention details saved.',
    );
  },
  config: async ({ cookies, params, request }) => {
    const form = await request.formData();
    return ok(
      () =>
        updateConventionConfigAction(cookies, {
          conventionId: params.id,
          catchCooldownSeconds: Number(form.get('catchCooldownSeconds') ?? 0),
          catchPoints: Number(form.get('catchPoints') ?? 1),
          featureStaffMode: form.get('featureStaffMode') === 'on',
        }),
      'Configuration saved.',
    );
  },
  lifecycle: async ({ cookies, params, request }) => {
    const action = String((await request.formData()).get('action') ?? '');
    const map: Record<string, () => Promise<unknown>> = {
      readiness: () => runConventionReadinessCheckAction(cookies, params.id),
      start: () => startConventionAction(cookies, params.id),
      rotate: () => rotateConventionDailiesAction(cookies, params.id),
      close: () => closeConventionAction(cookies, params.id),
      retry: () => retryConventionCloseoutAction(cookies, params.id),
      regenerate: () => regenerateConventionRecapsAction(cookies, params.id),
      delete: () => deleteArchivedConventionInDevAction(cookies, params.id),
      pack: () => generateConventionGameplayPackAction(cookies, params.id),
    };
    return ok(map[action] ?? map.readiness, 'Convention action completed.');
  },
  createTask: async ({ cookies, params, request }) => {
    const form = await request.formData();
    return ok(
      () =>
        createConventionTaskAction(cookies, {
          conventionId: params.id,
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? ''),
          kind: String(form.get('kind') ?? 'catch_count'),
          requirement: Number(form.get('requirement') ?? 1),
          metadata: null,
        }),
      'Task created.',
    );
  },
  toggleTask: async ({ cookies, params, request }) => {
    const form = await request.formData();
    return ok(
      () =>
        toggleConventionTaskAction(cookies, {
          conventionId: params.id,
          taskId: String(form.get('taskId') ?? ''),
          isActive: form.get('isActive') === 'true',
        }),
      'Task updated.',
    );
  },
  deleteTask: async ({ cookies, params, request }) => {
    const form = await request.formData();
    return ok(
      () =>
        deleteConventionTaskAction(cookies, {
          conventionId: params.id,
          taskId: String(form.get('taskId') ?? ''),
        }),
      'Task deleted.',
    );
  },
  createAchievement: async ({ cookies, params, request }) => {
    const form = await request.formData();
    return ok(
      () =>
        createConventionAchievementAction(cookies, {
          conventionId: params.id,
          key: String(form.get('key') ?? ''),
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? ''),
          category: String(form.get('category') ?? 'convention'),
          kind: String(form.get('kind') ?? 'convention_joined'),
          rule: {},
        }),
      'Achievement created.',
    );
  },
  toggleAchievement: async ({ cookies, params, request }) => {
    const form = await request.formData();
    return ok(
      () =>
        toggleConventionAchievementAction(cookies, {
          conventionId: params.id,
          achievementId: String(form.get('achievementId') ?? ''),
          isActive: form.get('isActive') === 'true',
        }),
      'Achievement updated.',
    );
  },
  deleteAchievement: async ({ cookies, params, request }) => {
    const form = await request.formData();
    return ok(
      () =>
        deleteConventionAchievementAction(cookies, {
          conventionId: params.id,
          achievementId: String(form.get('achievementId') ?? ''),
          ruleId: String(form.get('ruleId') ?? '') || null,
        }),
      'Achievement deleted.',
    );
  },
};
