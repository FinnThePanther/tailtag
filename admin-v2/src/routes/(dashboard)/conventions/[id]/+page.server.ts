import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
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
  updateConventionAchievementAction,
  updateConventionConfigAction,
  updateConventionDetailsAction,
  updateConventionTaskAction,
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
    const result = await run();
    return { message: typeof result === 'string' ? result : message };
  } catch (error) {
    if (isRedirect(error)) throw error;
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
    const map: Record<string, () => Promise<string>> = {
      readiness: async () => {
        const result = await runConventionReadinessCheckAction(cookies, params.id);
        return result.ready
          ? 'Readiness check passed.'
          : `Readiness check found ${result.blockingIssues.length} blocker(s).`;
      },
      start: async () => {
        const result = await startConventionAction(cookies, params.id);
        return result.status === 'live'
          ? 'Convention started and daily tasks were ensured.'
          : 'Convention scheduled. It still needs a manual start when the event begins.';
      },
      rotate: async () => {
        const result = await rotateConventionDailiesAction(cookies, params.id);
        const firstResult = Array.isArray(result?.results) ? result.results[0] : null;
        if (firstResult?.skipped) return `Rotation skipped: ${firstResult.reason}.`;
        if (firstResult?.refreshed === false) return 'Daily tasks were already rotated.';
        return 'Daily tasks rotated.';
      },
      close: async () => {
        const result = await closeConventionAction(cookies, params.id);
        return result.already_archived
          ? 'Convention was already archived.'
          : `Convention archived with ${result.recaps_generated} recap(s).`;
      },
      retry: async () => {
        const result = await retryConventionCloseoutAction(cookies, params.id);
        return result.already_archived
          ? 'Convention was already archived.'
          : `Closeout retried and archived with ${result.recaps_generated} recap(s).`;
      },
      regenerate: async () => {
        const result = await regenerateConventionRecapsAction(cookies, params.id);
        return `Recaps regenerated with ${result.recaps_generated} participant recap(s).`;
      },
      delete: async () => {
        await deleteArchivedConventionInDevAction(cookies, params.id);
        redirect(303, '/conventions');
      },
      pack: async () => {
        const result = await generateConventionGameplayPackAction(cookies, params.id);
        return `Gameplay pack ready: ${result.tasks.created} task(s) and ${result.achievements.created} achievement(s) created.`;
      },
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
          kind: String(form.get('kind') ?? 'catch'),
          requirement: Number(form.get('requirement') ?? 1),
          metadata: parseJsonObject(String(form.get('metadata') ?? '{}')),
        }),
      'Task created.',
    );
  },
  updateTask: async ({ cookies, params, request }) => {
    const form = await request.formData();
    return ok(
      () =>
        updateConventionTaskAction(cookies, {
          conventionId: params.id,
          taskId: String(form.get('taskId') ?? ''),
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? ''),
          kind: String(form.get('kind') ?? 'catch'),
          requirement: Number(form.get('requirement') ?? 1),
          metadata: parseJsonObject(String(form.get('metadata') ?? '{}')),
        }),
      'Task updated.',
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
          category: String(form.get('category') ?? 'catching'),
          kind: String(form.get('kind') ?? 'fursuit_caught_count_at_convention'),
          rule: parseJsonObject(String(form.get('rule') ?? '{}')),
        }),
      'Achievement created.',
    );
  },
  updateAchievement: async ({ cookies, params, request }) => {
    const form = await request.formData();
    return ok(
      () =>
        updateConventionAchievementAction(cookies, {
          conventionId: params.id,
          achievementId: String(form.get('achievementId') ?? ''),
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? ''),
          category: String(form.get('category') ?? 'catching'),
          kind: String(form.get('kind') ?? 'fursuit_caught_count_at_convention'),
          rule: parseJsonObject(String(form.get('rule') ?? '{}')),
          ruleId: String(form.get('ruleId') ?? '') || null,
        }),
      'Achievement updated.',
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

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value || '{}') as unknown;
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Expected JSON object.');
  }
  return parsed as Record<string, unknown>;
}
