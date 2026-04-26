<script lang="ts">
  import { ArrowUpRight, MapPin, SlidersHorizontal, Users } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';

  let { data, form } = $props();
  const config = $derived(normalizeConfig(data.convention.config));

  function normalizeConfig(raw: any) {
    return {
      catchCooldownSeconds: Number(raw?.cooldowns?.catch_seconds ?? 0),
      catchPoints: Number(raw?.points?.catch ?? 1),
      featureStaffMode: Boolean(raw?.feature_flags?.staff_mode ?? true)
    };
  }

  function startSkippedCopy(reason: string | null) {
    if (reason === 'before_window') return 'Convention created. It was not started because its local start date is still in the future.';
    if (reason === 'after_window') return 'Convention created. It was not started because its local date window has already ended.';
    if (reason === 'not_ready') return 'Convention created. It was not started because readiness checks still need attention.';
    return null;
  }
</script>

<div class="space-y-4">
  {#if startSkippedCopy(data.startSkipped)}
    <div class="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{startSkippedCopy(data.startSkipped)}</div>
  {/if}
  {#if form?.error}<div class="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">{form.error}</div>{/if}
  {#if form?.message}<div class="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">{form.message}</div>{/if}

  <Card title="Lifecycle" subtitle="Status, readiness, and closeout operations">
    <div class="space-y-4">
      <div class="grid gap-3 md:grid-cols-4">
        <div class="rounded-xl border border-border bg-background/50 p-3"><p class="text-xs uppercase tracking-wide text-muted">Status</p><p class="mt-1 font-semibold capitalize text-white">{data.convention.status}</p></div>
        <div class="rounded-xl border border-border bg-background/50 p-3"><p class="text-xs uppercase tracking-wide text-muted">Health</p><p class="mt-1 font-semibold capitalize text-white">{data.health.severity}</p></div>
        <div class="rounded-xl border border-border bg-background/50 p-3"><p class="text-xs uppercase tracking-wide text-muted">Local day</p><p class="mt-1 font-semibold text-white">{data.readiness.localDay}</p></div>
        <div class="rounded-xl border border-border bg-background/50 p-3"><p class="text-xs uppercase tracking-wide text-muted">Date state</p><p class="mt-1 font-semibold capitalize text-white">{data.readiness.dateState}</p></div>
      </div>
      {#if data.readiness.blockingIssues.length}<p class="text-sm text-red-100">{data.readiness.blockingIssues.join(' ')}</p>{/if}
      {#if data.health.warnings.length}<p class="text-sm text-amber-100">{data.health.warnings.join(' ')}</p>{/if}
      <form class="flex flex-wrap gap-2" method="POST" action="?/lifecycle">
        <button name="action" value="readiness" class="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary">Check readiness</button>
        <button name="action" value="start" class="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent">Start</button>
        <button name="action" value="rotate" class="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary">Rotate dailies</button>
        <button name="action" value="pack" class="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary">Generate gameplay pack</button>
        <button name="action" value="close" class="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary">Close</button>
        <button name="action" value="retry" class="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary">Retry closeout</button>
        <button name="action" value="regenerate" class="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary">Regenerate recaps</button>
        {#if data.showDevDelete}<button name="action" value="delete" class="rounded-lg border border-red-500/40 px-3 py-2 text-sm font-semibold text-red-100 transition hover:border-red-300">Delete archived convention</button>{/if}
      </form>
    </div>
  </Card>

  <Card title="Convention Details" subtitle="Basic information about this event">
    {#snippet actions()}
      <div class="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-slate-200"><Users size={14} class="text-primary" /><div><p class="text-xs uppercase tracking-wide text-muted">Staff assigned</p><p class="font-semibold text-white">{data.staff?.length ?? 0}</p></div></div>
    {/snippet}
    <form class="grid gap-3 md:grid-cols-2" method="POST" action="?/details">
      <label class="text-sm text-slate-200">Name<input name="name" value={data.convention.name} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
      <label class="text-sm text-slate-200">Slug<input name="slug" value={data.convention.slug} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
      <label class="text-sm text-slate-200">Start date<input name="startDate" type="date" value={data.convention.start_date ?? ''} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
      <label class="text-sm text-slate-200">End date<input name="endDate" type="date" value={data.convention.end_date ?? ''} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
      <label class="text-sm text-slate-200">Location<input name="location" value={data.convention.location ?? ''} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
      <label class="text-sm text-slate-200">Timezone<input name="timezone" value={data.convention.timezone ?? 'UTC'} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
      <button class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent md:col-span-2">Save details</button>
    </form>
  </Card>

  <Card title="Configuration" subtitle="Adjust event rules and feature flags">
    {#snippet actions()}<SlidersHorizontal size={16} class="text-primary" />{/snippet}
    <form class="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" method="POST" action="?/config">
      <label class="text-sm text-slate-200">Catch cooldown seconds<input name="catchCooldownSeconds" type="number" min="0" value={config.catchCooldownSeconds} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
      <label class="text-sm text-slate-200">Catch points<input name="catchPoints" type="number" value={config.catchPoints} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
      <label class="flex items-center gap-2 pt-7 text-sm text-slate-200"><input type="checkbox" name="featureStaffMode" checked={config.featureStaffMode} class="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary" /> Staff mode</label>
      <button class="self-end rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent">Save</button>
    </form>
  </Card>

  <Card title="Geo-fence" subtitle="Manage on-site verification boundaries">
    {#snippet actions()}<a href={`/conventions/${data.convention.id}/location`} class="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary">Manage map <ArrowUpRight size={14} /></a>{/snippet}
    <div class="grid gap-3 md:grid-cols-3">
      <div class="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-slate-200"><MapPin size={14} class="text-primary" /><div><p class="text-xs uppercase tracking-wide text-muted">Status</p><p class="font-semibold text-white">{data.convention.geofence_enabled ? 'Enabled' : 'Disabled'}</p></div></div>
      <div class="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-slate-200"><MapPin size={14} class="text-primary" /><div><p class="text-xs uppercase tracking-wide text-muted">Radius</p><p class="font-semibold text-white">{data.convention.geofence_radius_meters ? `${data.convention.geofence_radius_meters}m` : 'Not configured'}</p></div></div>
      <div class="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-slate-200"><MapPin size={14} class="text-primary" /><div><p class="text-xs uppercase tracking-wide text-muted">Verification</p><p class="font-semibold text-white">{data.convention.location_verification_required ? 'Required on opt-in' : 'Optional'}</p></div></div>
    </div>
  </Card>

  <Card title="Staff assignments" subtitle="People assigned to this convention">
    <Table headers={['Name', 'Role', 'Status', 'Assigned at', 'Notes']}>
      {#each data.staff ?? [] as assignment}
        {@const profile = Array.isArray(assignment.profiles) ? assignment.profiles[0] : assignment.profiles}
        <tr><td class="px-4 py-3 text-slate-200">{profile?.username ?? 'Unknown'}</td><td class="px-4 py-3 capitalize text-slate-200">{assignment.role}</td><td class="px-4 py-3 text-slate-200">{assignment.status}</td><td class="px-4 py-3 text-slate-200">{assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : '-'}</td><td class="px-4 py-3 text-slate-200">{assignment.notes ?? '-'}</td></tr>
      {:else}<tr><td class="px-4 py-3 text-sm text-muted" colspan="5">No staff assigned yet.</td></tr>{/each}
    </Table>
  </Card>

  <Card title="Convention tasks" subtitle="Daily tasks available at this convention">
    <form class="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_140px_120px_auto]" method="POST" action="?/createTask">
      <input name="name" required placeholder="Task name" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
      <input name="description" placeholder="Description" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
      <input name="kind" required placeholder="Kind" value="catch_count" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
      <input name="requirement" type="number" min="1" value="1" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
      <button class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent">Add task</button>
    </form>
    <Table headers={['Name', 'Kind', 'Requirement', 'Status', '']}>
      {#each data.tasks as task}
        <tr><td class="px-4 py-3 text-slate-200">{task.name}</td><td class="px-4 py-3 text-slate-200">{task.kind}</td><td class="px-4 py-3 text-slate-200">{task.requirement}</td><td class="px-4 py-3 text-slate-200">{task.is_active ? 'Active' : 'Inactive'}</td><td class="px-4 py-3"><form class="flex gap-2" method="POST"><input type="hidden" name="taskId" value={task.id} /><button formaction="?/toggleTask" name="isActive" value={task.is_active ? 'false' : 'true'} class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary">{task.is_active ? 'Disable' : 'Enable'}</button><button formaction="?/deleteTask" class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary">Delete</button></form></td></tr>
      {:else}<tr><td class="px-4 py-3 text-sm text-muted" colspan="5">No convention tasks yet.</td></tr>{/each}
    </Table>
  </Card>

  <Card title="Convention achievements" subtitle="Achievements scoped to this convention">
    <form class="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]" method="POST" action="?/createAchievement">
      <input name="key" required placeholder="Key" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
      <input name="name" required placeholder="Name" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
      <input name="description" placeholder="Description" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
      <select name="kind" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"><option value="convention_joined">convention_joined</option><option value="fursuit_caught_count_at_convention">fursuit_caught_count_at_convention</option></select>
      <button class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent">Add achievement</button>
    </form>
    <Table headers={['Name', 'Category', 'Status', '']}>
      {#each data.achievements as achievement}
        <tr><td class="px-4 py-3 text-slate-200">{achievement.name}</td><td class="px-4 py-3 text-slate-200">{achievement.category}</td><td class="px-4 py-3 text-slate-200">{achievement.is_active ? 'Active' : 'Inactive'}</td><td class="px-4 py-3"><form class="flex gap-2" method="POST"><input type="hidden" name="achievementId" value={achievement.id} /><input type="hidden" name="ruleId" value={achievement.rule_id ?? ''} /><button formaction="?/toggleAchievement" name="isActive" value={achievement.is_active ? 'false' : 'true'} class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary">{achievement.is_active ? 'Disable' : 'Enable'}</button><button formaction="?/deleteAchievement" class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary">Delete</button></form></td></tr>
      {:else}<tr><td class="px-4 py-3 text-sm text-muted" colspan="4">No convention achievements yet.</td></tr>{/each}
    </Table>
  </Card>
</div>
