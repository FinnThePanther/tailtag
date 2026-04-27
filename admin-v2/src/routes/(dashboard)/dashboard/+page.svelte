<script lang="ts">
  import { AlertCircle, ArrowUpRight, CalendarDays, ShieldBan, Users } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';
  import Metric from '$lib/components/Metric.svelte';

  let { data } = $props();
</script>

<div class="space-y-6">
  <div class="grid gap-4 md:grid-cols-4">
    <Metric label="Players" value={data.summary.totalPlayers}><Users size={16} class="text-primary" /></Metric>
    <Metric label="Suspended" value={data.summary.suspendedPlayers} hint="Active bans">
      <ShieldBan size={16} class="text-primary" />
    </Metric>
    <Metric label="Conventions" value={data.summary.activeConventions}>
      <CalendarDays size={16} class="text-primary" />
    </Metric>
    <Metric label="Pending reports" value={data.summary.pendingReports}>
      <AlertCircle size={16} class="text-primary" />
    </Metric>
  </div>

  <Card title="Conventions" subtitle="Event overview with quick links">
    <div class="divide-y divide-border/80">
      {#if data.conventions.length === 0}
        <p class="py-4 text-sm text-muted">No conventions yet.</p>
      {:else}
        {#each data.conventions as convention}
          <div class="flex items-center justify-between gap-3 py-3 text-sm text-slate-200">
            <div>
              <p class="font-semibold text-white">{convention.name}</p>
              <p class="text-muted">
                {convention.start_date
                  ? `${convention.start_date} -> ${convention.end_date ?? 'TBD'}`
                  : 'Dates TBD'}
                {convention.location ? ` - ${convention.location}` : ''}
              </p>
            </div>
            <a
              href={`/conventions/${convention.id}`}
              class="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
            >
              View <ArrowUpRight size={14} />
            </a>
          </div>
        {/each}
      {/if}
    </div>
  </Card>

  <Card title="Quick actions" subtitle="Get to common flows fast">
    <div class="grid gap-3 sm:grid-cols-3">
      <a href="/players" class="flex flex-col gap-2 rounded-xl border border-border bg-panel/60 p-4 transition hover:border-primary">
        <div class="flex items-center justify-between">
          <p class="text-base font-semibold text-white">Player search</p>
          <ArrowUpRight size={16} class="text-primary" />
        </div>
        <p class="text-sm text-muted">Find players across events</p>
      </a>
      <a href="/staff" class="flex flex-col gap-2 rounded-xl border border-border bg-panel/60 p-4 transition hover:border-primary">
        <div class="flex items-center justify-between">
          <p class="text-base font-semibold text-white">Staff assignments</p>
          <ArrowUpRight size={16} class="text-primary" />
        </div>
        <p class="text-sm text-muted">Manage event staff access</p>
      </a>
      <a href="/audit" class="flex flex-col gap-2 rounded-xl border border-border bg-panel/60 p-4 transition hover:border-primary">
        <div class="flex items-center justify-between">
          <p class="text-base font-semibold text-white">Audit log</p>
          <ArrowUpRight size={16} class="text-primary" />
        </div>
        <p class="text-sm text-muted">Review recent admin activity</p>
      </a>
    </div>
  </Card>
</div>
