<script lang="ts">
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';

  let { data, form } = $props();
</script>

<div class="space-y-4">
  <Card title="Assign staff" subtitle="Grant event-scoped access">
    {#if form?.error}<div class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{form.error}</div>{/if}
    {#if form?.message}<div class="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{form.message}</div>{/if}
    <form class="grid gap-3 md:grid-cols-[1fr_1fr_120px_120px_1fr_auto]" method="POST" action="?/add">
      <input name="profileId" required placeholder="Profile ID" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
      <select name="conventionId" required class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary">
        {#each data.conventions as convention}<option value={convention.id}>{convention.name}</option>{/each}
      </select>
      <select name="role" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"><option value="staff">staff</option><option value="organizer">organizer</option></select>
      <select name="status" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"><option value="active">active</option><option value="inactive">inactive</option></select>
      <input name="notes" placeholder="Notes" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
      <button class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent">Assign</button>
    </form>
  </Card>

  <Card title="Assignments" subtitle="Current staff per convention">
    <Table headers={['Name', 'Convention', 'Role', 'Status', 'Assigned', '']}>
      {#each data.assignments as assignment}
        {@const profile = Array.isArray(assignment.profiles) ? assignment.profiles[0] : assignment.profiles}
        <tr>
          <td class="px-4 py-3 text-slate-200">{profile?.username ?? assignment.profile_id}</td>
          <td class="px-4 py-3 text-slate-200">{assignment.conventions?.name ?? assignment.convention_id}</td>
          <td class="px-4 py-3 capitalize text-slate-200">{assignment.role}</td>
          <td class="px-4 py-3 text-slate-200">{assignment.status}</td>
          <td class="px-4 py-3 text-slate-200">{assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : '-'}</td>
          <td class="px-4 py-3 text-right">
            <form method="POST" action="?/remove">
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <input type="hidden" name="conventionId" value={assignment.convention_id} />
              <button class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary">Remove</button>
            </form>
          </td>
        </tr>
      {:else}
        <tr><td class="px-4 py-3 text-sm text-muted" colspan="6">No staff assignments yet.</td></tr>
      {/each}
    </Table>
  </Card>
</div>
