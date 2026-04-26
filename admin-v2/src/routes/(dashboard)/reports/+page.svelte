<script lang="ts">
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';

  let { data, form } = $props();
</script>

<div class="space-y-4">
  <Card title="Filters" subtitle="Triage the queue">
    <form class="grid gap-3 md:grid-cols-[160px_160px_1fr_auto]" method="GET">
      <select name="status" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary">
        <option value="">All statuses</option>
        {#each ['pending', 'resolved', 'dismissed'] as status}<option value={status} selected={data.params.status === status}>{status}</option>{/each}
      </select>
      <select name="severity" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary">
        <option value="">All severities</option>
        {#each ['low', 'medium', 'high', 'critical'] as severity}<option value={severity} selected={data.params.severity === severity}>{severity}</option>{/each}
      </select>
      <select name="conventionId" class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary">
        <option value="">All conventions</option>
        {#each data.conventions as convention}<option value={convention.id} selected={data.params.conventionId === convention.id}>{convention.name}</option>{/each}
      </select>
      <button class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent">Apply</button>
    </form>
  </Card>
  <Card title="Reports" subtitle={`Total: ${data.reports.length}`}>
    {#if form?.error}<div class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{form.error}</div>{/if}
    <Table headers={['Type', 'Status', 'Reporter', 'Target', 'Description', 'Created', 'Actions']}>
      {#each data.reports as report}
        {@const reporter = Array.isArray(report.profiles) ? report.profiles[0]?.username : report.profiles?.username}
        {@const target = Array.isArray(report.reported) ? report.reported[0]?.username : report.reported?.username}
        {@const reportedFursuit = report.reported_fursuit}
        <tr class="align-top text-sm leading-5">
          <td class="px-4 py-3 text-slate-200">{report.report_type}</td>
          <td class="px-4 py-3 capitalize text-slate-200">{report.status}</td>
          <td class="px-4 py-3 text-slate-200">
            {#if reporter ?? report.reporter_id}
              <span class="font-medium text-slate-100">{reporter ?? report.reporter_id}</span>
            {:else}
              <span class="text-muted">—</span>
            {/if}
          </td>
          <td class="px-4 py-3 text-slate-200">
            <div class="space-y-2">
              {#if report.reported_user_id}
                <div class="inline-grid grid-cols-[3.25rem_auto] items-center gap-2">
                  <span class="text-xs text-muted">User</span>
                  <a
                    href={`/players/${report.reported_user_id}`}
                    class="inline-flex items-center rounded-lg border border-border px-2.5 py-1 text-xs font-semibold leading-none text-slate-100 transition hover:border-primary"
                  >
                    {target ?? report.reported_user_id}
                  </a>
                </div>
              {/if}
              {#if report.reported_fursuit_id}
                <div class="space-y-1">
                  <div class="inline-grid grid-cols-[3.25rem_auto] items-center gap-2">
                    <span class="text-xs text-muted">Fursuit</span>
                    <span class="text-sm text-slate-100">
                      {reportedFursuit?.name ?? report.reported_fursuit_id}
                    </span>
                  </div>
                  {#if reportedFursuit?.owner_id}
                    <div class="inline-grid grid-cols-[3.25rem_auto] items-center gap-2">
                      <span class="text-xs text-muted">Owner</span>
                      <a
                        href={`/players/${reportedFursuit.owner_id}`}
                        class="text-sm font-medium text-slate-100 underline decoration-border underline-offset-4 transition hover:text-primary"
                      >
                        {reportedFursuit.owner?.username ?? reportedFursuit.owner_id}
                      </a>
                    </div>
                  {/if}
                </div>
              {/if}
              {#if !report.reported_user_id && !report.reported_fursuit_id}
                <span class="text-muted">—</span>
              {/if}
            </div>
          </td>
          <td class="px-4 py-3 text-slate-200">
            {#if report.description}
              <span class="line-clamp-2 max-w-xs text-sm">{report.description}</span>
            {:else}
              <span class="text-muted">—</span>
            {/if}
          </td>
          <td class="px-4 py-3 text-slate-200">
            {report.created_at ? new Date(report.created_at).toLocaleString() : '—'}
          </td>
          <td class="px-4 py-3 text-sm text-slate-200">
            {#if report.status === 'resolved' || report.status === 'dismissed'}
              <span class="font-medium text-muted">Closed</span>
            {:else}
              <form class="space-y-2" method="POST" action="?/resolve">
                <input type="hidden" name="reportId" value={report.id} />
                <textarea
                  name="resolutionNotes"
                  placeholder="Resolution notes"
                  class="w-48 rounded-lg border border-border bg-background px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary"
                ></textarea>
                <div class="flex gap-2">
                  <button
                    name="status"
                    value="resolved"
                    class="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-slate-900 transition hover:bg-accent"
                  >
                    Resolve
                  </button>
                  <button
                    name="status"
                    value="dismissed"
                    class="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-slate-100 transition hover:border-primary"
                  >
                    Dismiss
                  </button>
                </div>
              </form>
            {/if}
          </td>
        </tr>
      {:else}
        <tr><td class="px-4 py-3 text-sm text-muted" colspan="7">No reports found.</td></tr>
      {/each}
    </Table>
  </Card>
</div>
