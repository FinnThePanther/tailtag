<script lang="ts">
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';

  let { data } = $props();
</script>

<Card title="Audit log" subtitle="Recent admin actions">
  <Table headers={['Action', 'Entity', 'Actor', 'Context', 'Created']}>
    {#each data.logs as log}
      <tr>
        <td class="px-4 py-3 text-slate-200">{log.action}</td>
        <td class="px-4 py-3 text-slate-200">{log.entity_type}{log.entity_id ? ` (${log.entity_id})` : ''}</td>
        <td class="px-4 py-3 text-slate-200">{log.actor_id}</td>
        <td class="px-4 py-3 text-slate-200">{log.context ? JSON.stringify(log.context) : '-'}</td>
        <td class="px-4 py-3 text-slate-200">{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
      </tr>
    {:else}
      <tr>
        <td class="px-4 py-3 text-sm text-muted" colspan="5">No audit entries yet.</td>
      </tr>
    {/each}
  </Table>
</Card>
