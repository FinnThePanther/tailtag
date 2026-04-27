<script lang="ts">
  import { goto } from '$app/navigation';
  import { Shield, UserRound } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';

  let { data } = $props();

  let query = $state('');
  let role = $state('');
  let suspended = $state('');
  let conventionId = $state('');
  let initializedParams = $state('');

  $effect(() => {
    const nextParams = JSON.stringify(data.params);
    if (initializedParams !== nextParams) {
      query = data.params.q ?? '';
      role = data.params.role ?? '';
      suspended = data.params.suspended ?? '';
      conventionId = data.params.conventionId ?? '';
      initializedParams = nextParams;
    }
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const params = [
      query ? `q=${encodeURIComponent(query)}` : '',
      role ? `role=${encodeURIComponent(role)}` : '',
      suspended ? `suspended=${encodeURIComponent(suspended)}` : '',
      conventionId ? `conventionId=${encodeURIComponent(conventionId)}` : ''
    ].filter(Boolean);
    goto(params.length > 0 ? `/players?${params.join('&')}` : '/players');
  }
</script>

<div class="space-y-4">
  <Card title="Player search" subtitle="Search by username or email">
    <form class="grid gap-4 md:grid-cols-4" method="GET" onsubmit={submit}>
      <div class="md:col-span-2">
        <label class="text-sm text-slate-200" for="q">Search</label>
        <input
          id="q"
          name="q"
          bind:value={query}
          placeholder="Username or email"
          class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        />
      </div>
      <div>
        <label class="text-sm text-slate-200" for="role">Role</label>
        <select
          id="role"
          name="role"
          bind:value={role}
          class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="">Any</option>
          <option value="owner">Owner</option>
          <option value="organizer">Organizer</option>
          <option value="staff">Staff</option>
          <option value="moderator">Moderator</option>
          <option value="player">Player</option>
        </select>
      </div>
      <div>
        <label class="text-sm text-slate-200" for="suspended">Suspended</label>
        <select
          id="suspended"
          name="suspended"
          bind:value={suspended}
          class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>
      <div class="md:col-span-2">
        <label class="text-sm text-slate-200" for="conventionId">Convention</label>
        <select
          id="conventionId"
          name="conventionId"
          bind:value={conventionId}
          class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="">Any</option>
          {#each data.conventions as convention}
            <option value={convention.id}>{convention.name}</option>
          {/each}
        </select>
      </div>
      <div class="flex items-end md:col-span-2">
        <button
          type="submit"
          class="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent"
        >
          Search
        </button>
      </div>
    </form>
  </Card>
  <Card title="Results" subtitle={`Showing ${data.players.length} players`}>
    <Table headers={['Player', 'Role', 'Status', 'Catches', 'Reports', 'Created', '']}>
      {#each data.players as player}
        <tr>
          <td class="px-4 py-3">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
                <UserRound size={18} class="text-primary" />
              </div>
              <div>
                <p class="font-semibold text-white">{player.username ?? 'Unknown'}</p>
                <p class="text-xs text-muted">{player.email ?? 'No email'}</p>
              </div>
            </div>
          </td>
          <td class="px-4 py-3 capitalize text-slate-200">{player.role}</td>
          <td class="px-4 py-3 text-slate-200">
            {#if player.is_suspended}
              <span class="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-200">
                <Shield size={12} /> Suspended
              </span>
            {:else}
              <span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                Active
              </span>
            {/if}
          </td>
          <td class="px-4 py-3 text-slate-200">{player.catch_count}</td>
          <td class="px-4 py-3 text-slate-200">{player.report_count}</td>
          <td class="px-4 py-3 text-slate-200">
            {new Date(player.created_at).toLocaleDateString()}
          </td>
          <td class="px-4 py-3 text-right">
            <a
              href={`/players/${player.id}`}
              class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
            >
              View
            </a>
          </td>
        </tr>
      {:else}
        <tr>
          <td class="px-4 py-3 text-sm text-muted" colspan="7">No players found.</td>
        </tr>
      {/each}
    </Table>
  </Card>
</div>
