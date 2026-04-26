<script lang="ts">
  import { ArrowUpRight, MapPin, Plus } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';

  let { data } = $props();
  const healthByConvention = $derived(new Map(data.healthEntries));

  function statusClass(status: string) {
    if (status === 'live') return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';
    if (status === 'scheduled') return 'border-sky-400/40 bg-sky-500/10 text-sky-100';
    if (status === 'archived') return 'border-slate-400/40 bg-slate-500/10 text-slate-200';
    if (status === 'canceled') return 'border-red-400/40 bg-red-500/10 text-red-100';
    return 'border-amber-400/40 bg-amber-500/10 text-amber-100';
  }

  function healthClass(severity: string) {
    if (severity === 'healthy') return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';
    if (severity === 'info') return 'border-sky-400/40 bg-sky-500/10 text-sky-100';
    if (severity === 'warning') return 'border-amber-400/40 bg-amber-500/10 text-amber-100';
    return 'border-red-400/40 bg-red-500/10 text-red-100';
  }

  function formatRecommendedAction(action: string) {
    return action
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
</script>

<Card title="Conventions" subtitle="Event list">
  {#snippet actions()}
    <a href="/conventions/new" class="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary">
      <Plus size={14} /> Create convention
    </a>
  {/snippet}
  <div class="divide-y divide-border/80">
    {#each data.conventions as convention}
      {@const health = healthByConvention.get(convention.id)}
      <div class="flex items-center justify-between gap-3 py-3">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-base font-semibold text-white">{convention.name}</p>
            <span class={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(convention.status)}`}>{convention.status}</span>
            {#if health}<span class={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${healthClass(health.severity)}`}>{health.severity}</span>{/if}
          </div>
          <p class="text-sm text-muted">
            {convention.start_date ? `${convention.start_date} -> ${convention.end_date ?? 'TBD'}` : 'Dates TBD'}
            {#if convention.location}<span class="inline-flex items-center gap-1 pl-2"><MapPin size={14} /> {convention.location}</span>{/if}
          </p>
          {#if health && health.warnings.length > 0}
            <p class="text-xs text-amber-100">{health.warnings[0]} <span class="font-semibold">{formatRecommendedAction(health.recommendedAction)}</span></p>
          {/if}
        </div>
        <a href={`/conventions/${convention.id}`} class="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary">
          View <ArrowUpRight size={14} />
        </a>
      </div>
    {:else}
      <p class="py-3 text-sm text-muted">No conventions created yet.</p>
    {/each}
  </div>
</Card>
