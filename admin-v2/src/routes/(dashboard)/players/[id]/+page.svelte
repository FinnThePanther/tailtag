<script lang="ts">
  import { Activity, ShieldAlert } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';

  let { data, form } = $props();
</script>

<div class="space-y-6">
  <Card title={data.profile.username ?? 'Player'} subtitle={data.profile.id}>
    {#snippet actions()}
      {#if data.profile.is_suspended}
        <span class="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
          <ShieldAlert size={14} /> Suspended
        </span>
      {/if}
    {/snippet}
    <div class="grid gap-4 md:grid-cols-4">
      <div class="rounded-xl border border-border bg-background/50 p-3"><p class="text-xs uppercase tracking-wide text-muted">Role</p><p class="mt-1 text-base font-semibold text-white">{data.profile.role}</p></div>
      <div class="rounded-xl border border-border bg-background/50 p-3"><p class="text-xs uppercase tracking-wide text-muted">Created</p><p class="mt-1 text-base font-semibold text-white">{data.profile.created_at ? new Date(data.profile.created_at).toLocaleDateString() : '-'}</p></div>
      <div class="rounded-xl border border-border bg-background/50 p-3"><p class="text-xs uppercase tracking-wide text-muted">Suspended until</p><p class="mt-1 text-base font-semibold text-white">{data.profile.suspended_until ?? '-'}</p></div>
      <div class="rounded-xl border border-border bg-background/50 p-3"><p class="text-xs uppercase tracking-wide text-muted">Suspension reason</p><p class="mt-1 text-base font-semibold text-white">{data.profile.suspension_reason ?? '-'}</p></div>
    </div>
  </Card>

  <div class="grid gap-4 md:grid-cols-2">
    <Card title="Moderation summary" subtitle="Counts and flags">
      <div class="grid gap-3 sm:grid-cols-2">
        {#each [
          ['Active bans', data.moderationSummary?.active_bans ?? 0],
          ['Reports', data.moderationSummary?.report_count ?? 0],
          ['Pending reports', data.moderationSummary?.pending_reports ?? 0],
          ['Blocked by others', data.moderationSummary?.users_blocked ?? 0]
        ] as metric}
          <div class="flex items-center justify-between rounded-xl border border-border bg-background/50 px-3 py-2">
            <div class="flex items-center gap-2 text-sm text-slate-200"><Activity size={14} class="text-primary" /><span>{metric[0]}</span></div>
            <span class="text-lg font-semibold text-white">{metric[1]}</span>
          </div>
        {/each}
      </div>
    </Card>

    <div class="rounded-2xl border border-border bg-panel/80 p-4">
      <div class="mb-3 flex items-center justify-between">
        <div><p class="text-sm font-semibold text-white">Moderation actions</p><p class="text-xs text-muted">Ban or mute users; writes to audit log.</p></div>
        {#if form?.message}<p class="text-xs text-primary">{form.message}</p>{/if}
      </div>
      {#if form?.error}<div class="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{form.error}</div>{/if}
      <form class="space-y-2 rounded-xl border border-border bg-background/50 p-3" method="POST">
        <div><p class="text-sm font-semibold text-white">Ban</p><p class="text-xs text-muted">Global or event-scoped ban.</p></div>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="text-xs text-slate-200">Reason<input name="reason" placeholder="Reason for ban" class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" /></label>
          <label class="text-xs text-slate-200">Duration (hours, blank for permanent)<input name="durationHours" type="number" min="0" class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" /></label>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="text-xs text-slate-200">Scope<select name="scope" class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"><option value="global">Global</option><option value="event">Event only</option></select></label>
          <label class="text-xs text-slate-200">Convention<select name="conventionId" class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"><option value="">Select convention</option>{#each data.conventions as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
        </div>
        <div class="flex gap-2">
          <button formaction="?/ban" class="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent">Apply ban</button>
          {#if data.profile.is_suspended}<button formaction="?/unban" class="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary">Lift ban</button>{/if}
        </div>
      </form>
    </div>
  </div>

  <Card title="User blocks" subtitle="Block relationships">
    <Table headers={['Direction', 'Username', 'Date']}>
      {#each data.blocks as block}
        <tr><td class="px-4 py-3 text-slate-200">{block.direction === 'blocked' ? 'Blocked' : 'Blocked by'}</td><td class="px-4 py-3 text-slate-200">{block.other_username ?? block.other_user_id}</td><td class="px-4 py-3 text-slate-200">{new Date(block.created_at).toLocaleString()}</td></tr>
      {:else}
        <tr><td class="px-4 py-3 text-sm text-muted" colspan="3">No block relationships.</td></tr>
      {/each}
    </Table>
  </Card>

  <Card title="Recent moderation actions" subtitle="Latest 10 actions">
    <Table headers={['Type', 'Scope', 'Reason', 'Duration', 'Status', 'Created']}>
      {#each data.actions ?? [] as action}
        <tr>
          <td class="px-4 py-3 capitalize text-slate-200">{action.action_type}</td>
          <td class="px-4 py-3 text-slate-200">{action.scope}{action.convention_id ? ` (${action.convention_id})` : ''}</td>
          <td class="px-4 py-3 text-slate-200">{action.reason ?? '-'}</td>
          <td class="px-4 py-3 text-slate-200">{action.duration_hours ? `${action.duration_hours}h` : '-'}</td>
          <td class="px-4 py-3 text-slate-200">{action.is_active ? 'Active' : 'Inactive'}</td>
          <td class="px-4 py-3 text-slate-200">{new Date(action.created_at).toLocaleString()}</td>
        </tr>
      {:else}
        <tr><td class="px-4 py-3 text-sm text-muted" colspan="6">No moderation actions recorded.</td></tr>
      {/each}
    </Table>
  </Card>
</div>
