<script lang="ts">
  import type {
    ConventionLifecycleHealthSeverity,
    ConventionLifecycleRecommendedAction
  } from '$lib/server/convention-lifecycle';

  export function statusClass(status: string) {
    if (status === 'live') return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';
    if (status === 'scheduled') return 'border-sky-400/40 bg-sky-500/10 text-sky-100';
    if (status === 'archived') return 'border-slate-400/40 bg-slate-500/10 text-slate-200';
    if (status === 'canceled') return 'border-red-400/40 bg-red-500/10 text-red-100';
    return 'border-amber-400/40 bg-amber-500/10 text-amber-100';
  }

  export function healthClass(severity: ConventionLifecycleHealthSeverity) {
    if (severity === 'healthy') return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';
    if (severity === 'info') return 'border-sky-400/40 bg-sky-500/10 text-sky-100';
    if (severity === 'warning') return 'border-amber-400/40 bg-amber-500/10 text-amber-100';
    return 'border-red-400/40 bg-red-500/10 text-red-100';
  }

  export function formatRecommendedAction(action: ConventionLifecycleRecommendedAction) {
    return action
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  let { type, value } = $props<{
    type: 'status' | 'health';
    value: string;
  }>();

  const className = $derived(
    type === 'status'
      ? statusClass(value)
      : healthClass(value as ConventionLifecycleHealthSeverity)
  );
</script>

<span class={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${className}`}>
  {value}
</span>
