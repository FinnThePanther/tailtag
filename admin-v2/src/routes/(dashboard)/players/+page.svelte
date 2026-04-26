<script lang="ts">
  import { Shield, UserRound } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';

  let { data } = $props();
</script>

<div class="space-y-4">
  <Card title="Player search" subtitle="Search by username or email">
    <form class="grid gap-3 md:grid-cols-[1fr_160px_160px_1fr_auto]" method="GET">
      <input
        name="q"
        value={data.params.q}
        placeholder="Username or email"
        class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
      />
      <select name="role" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary">
        <option value="">All roles</option>
        {#each ['player', 'staff', 'moderator', 'organizer', 'owner'] as role}
          <option value={role} selected={data.params.role === role}>{role}</option>
        {/each}
      </select>
      <select
        name="suspended"
        class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
      >
        <option value="">All statuses</option>
        <option value="true" selected={data.params.suspended === 'true'}>Suspended</option>
        <option value="false" selected={data.params.suspended === 'false'}>Active</option>
      </select>
      <select
        name="conventionId"
        class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
      >
        <option value="">All conventions</option>
        {#each data.conventions as convention}
          <option value={convention.id} selected={data.params.conventionId === convention.id}>{convention.name}</option>
        {/each}
      </select>
      <button class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent">Search</button>
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
          <td class="px-4 py-3 text-slate-200">{new Date(player.created_at).toLocaleDateString()}</td>
          <td class="px-4 py-3 text-right">
            <a href={`/players/${player.id}`} class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary">
              View
            </a>
          </td>
        </tr>
      {:else}
        <tr><td class="px-4 py-3 text-sm text-muted" colspan="7">No players found.</td></tr>
      {/each}
    </Table>
  </Card>
</div>
