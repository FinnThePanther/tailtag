<script lang="ts">
  import { enhance } from '$app/forms';
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';

  let { data, form } = $props();
  let pendingConventionId = $state<string | null>(null);
</script>

<div class="space-y-4">
  <Card title="Analytics" subtitle="Event metrics and exports">
    <Table headers={['Convention', 'Catches (total)', 'Catches today', 'Pending catches', 'Export']}>
      {#each data.rows as row}
        <tr>
          <td class="px-4 py-3 text-slate-200"><div class="flex flex-col"><span class="font-semibold text-white">{row.name}</span><span class="text-xs text-muted">{row.slug}</span></div></td>
          <td class="px-4 py-3 text-white">{row.stats?.totalCatches ?? 0}</td>
          <td class="px-4 py-3 text-white">{row.stats?.catchesToday ?? 0}</td>
          <td class="px-4 py-3 text-white">{row.stats?.pendingCatches ?? 0}</td>
          <td class="px-4 py-3"><a href={`/api/conventions/${row.id}/catches/export`} class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary">Export CSV</a></td>
        </tr>
      {:else}
        <tr><td class="px-4 py-3 text-sm text-muted" colspan="5">No conventions found.</td></tr>
      {/each}
    </Table>
  </Card>

  {#if form?.error}<div class="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{form.error}</div>{/if}
  {#if form?.message}
    <p class="text-xs text-primary">{form.message}</p>
  {/if}
  {#each data.rows as row}
    <Card title={`Simulate catch - ${row.name}`} subtitle="Creates an accepted catch for testing (audit logged)">
      <form
        class="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
        method="POST"
        action="?/simulate"
        use:enhance={({ formElement }) => {
          pendingConventionId = row.id;
          return async ({ result, update }) => {
            pendingConventionId = null;
            await update();
            if (result.type === 'success') {
              formElement.reset();
            }
          };
        }}
      >
        <input type="hidden" name="conventionId" value={row.id} />
        <input name="catcherId" required placeholder="Catcher profile ID" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
        <input name="fursuitId" required placeholder="Fursuit ID" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" />
        <button
          disabled={pendingConventionId === row.id}
          class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
        >
          {pendingConventionId === row.id ? 'Simulating...' : 'Simulate catch'}
        </button>
      </form>
    </Card>
  {/each}
</div>
