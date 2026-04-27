<script lang="ts">
  import { enhance } from '$app/forms';
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';

  let { data, form } = $props();

  let profileId = $state('');
  let conventionId = $state('');
  let role = $state<'staff' | 'organizer'>('staff');
  let status = $state<'active' | 'inactive'>('active');
  let notes = $state('');
  let pendingAdd = $state(false);
  let removingId = $state<string | null>(null);
  let initializedConventions = $state(false);

  $effect(() => {
    if (!initializedConventions && data.conventions[0]?.id) {
      conventionId = data.conventions[0].id;
      initializedConventions = true;
    }
  });
</script>

<div class="space-y-4">
  <Card title="Assign staff" subtitle="Grant event-scoped access">
    {#if form?.error}
      <div class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
        {form.error}
      </div>
    {/if}
    <form
      class="grid gap-4 md:grid-cols-2"
      method="POST"
      action="?/add"
      use:enhance={() => {
        pendingAdd = true;
        return async ({ result, update }) => {
          pendingAdd = false;
          await update();
          if (result.type === 'success') {
            profileId = '';
            notes = '';
          }
        };
      }}
    >
      <div>
        <label class="text-sm text-slate-200" for="profileId">Profile ID</label>
        <input
          id="profileId"
          name="profileId"
          required
          bind:value={profileId}
          placeholder="User UUID"
          class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        />
      </div>
      <div>
        <label class="text-sm text-slate-200" for="conventionId">Convention</label>
        <select
          id="conventionId"
          name="conventionId"
          required
          bind:value={conventionId}
          class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          {#each data.conventions as convention}
            <option value={convention.id}>{convention.name}</option>
          {/each}
        </select>
      </div>
      <div>
        <label class="text-sm text-slate-200" for="role">Role</label>
        <select
          id="role"
          name="role"
          bind:value={role}
          class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="staff">Staff</option>
          <option value="organizer">Organizer</option>
        </select>
      </div>
      <div>
        <label class="text-sm text-slate-200" for="status">Status</label>
        <select
          id="status"
          name="status"
          bind:value={status}
          class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div class="md:col-span-2">
        <label class="text-sm text-slate-200" for="notes">Notes</label>
        <input
          id="notes"
          name="notes"
          bind:value={notes}
          placeholder="Optional context"
          class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        />
      </div>
      <div class="flex items-center justify-between md:col-span-2">
        <button
          type="submit"
          disabled={pendingAdd}
          class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
        >
          {pendingAdd ? 'Assigning...' : 'Assign staff'}
        </button>
        {#if form?.message}
          <p class="text-xs text-primary">{form.message}</p>
        {/if}
      </div>
    </form>
  </Card>

  <Card title="Assignments" subtitle="Current staff per convention">
    <Table headers={['Name', 'Convention', 'Role', 'Status', 'Assigned', '']}>
      {#each data.assignments as assignment}
        {@const profile = Array.isArray(assignment.profiles) ? assignment.profiles[0] : assignment.profiles}
        <tr>
          <td class="px-4 py-3 text-slate-200">{profile?.username ?? assignment.profile_id}</td>
          <td class="px-4 py-3 text-slate-200">
            {assignment.conventions?.name ?? assignment.convention_id}
          </td>
          <td class="px-4 py-3 capitalize text-slate-200">{assignment.role}</td>
          <td class="px-4 py-3 text-slate-200">{assignment.status}</td>
          <td class="px-4 py-3 text-slate-200">
            {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : '—'}
          </td>
          <td class="px-4 py-3 text-right">
            <form
              method="POST"
              action="?/remove"
              use:enhance={() => {
                removingId = assignment.id;
                return async ({ update }) => {
                  removingId = null;
                  await update();
                };
              }}
            >
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <input type="hidden" name="conventionId" value={assignment.convention_id} />
              <button
                type="submit"
                disabled={removingId === assignment.id}
                class="rounded-lg border border-red-500/60 px-3 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                {removingId === assignment.id ? 'Removing...' : 'Remove'}
              </button>
            </form>
          </td>
        </tr>
      {:else}
        <tr>
          <td class="px-4 py-3 text-sm text-muted" colspan="6">No staff assignments yet.</td>
        </tr>
      {/each}
    </Table>
  </Card>
</div>
