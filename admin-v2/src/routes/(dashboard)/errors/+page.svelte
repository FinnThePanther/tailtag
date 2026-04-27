<script lang="ts">
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';

  let { data } = $props();
</script>

<Card title="Admin errors" subtitle="Recent error events captured by admin_error_log">
  <Table headers={['Type', 'Message', 'Severity', 'Convention', 'Occurred']}>
    {#each data.errors as error}
      <tr>
        <td class="px-4 py-3 text-slate-200">{error.error_type}</td>
        <td class="px-4 py-3 text-slate-200">{error.error_message}</td>
        <td class="px-4 py-3 text-slate-200">{error.severity}</td>
        <td class="px-4 py-3 text-slate-200">{error.convention_id ?? '-'}</td>
        <td class="px-4 py-3 text-slate-200">{error.occurred_at ? new Date(error.occurred_at).toLocaleString() : '-'}</td>
      </tr>
    {:else}
      <tr>
        <td class="px-4 py-3 text-sm text-muted" colspan="5">No errors logged.</td>
      </tr>
    {/each}
  </Table>
</Card>
