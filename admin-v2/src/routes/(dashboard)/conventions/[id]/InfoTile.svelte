<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    icon = null,
    label,
    rounded = 'lg',
    children
  }: {
    icon?: any;
    label: string;
    rounded?: 'lg' | 'xl';
    children: Snippet;
  } = $props();

  const radiusClass = $derived(rounded === 'xl' ? 'rounded-xl' : 'rounded-lg');
</script>

<div
  class={`flex items-center gap-2 ${radiusClass} border border-border bg-background/50 px-3 py-2 text-sm text-slate-200`}
>
  {#if icon}
    {@const Icon = icon}
    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-primary">
      <Icon size={14} />
    </div>
  {/if}
  <div>
    <p class="text-xs uppercase tracking-wide text-muted">{label}</p>
    <p class="font-semibold text-white">{@render children()}</p>
  </div>
</div>
