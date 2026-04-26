<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    name,
    value,
    icon,
    disabled = false,
    variant = 'default',
    confirmText = '',
    children
  }: {
    name: string;
    value: string;
    icon: any;
    disabled?: boolean;
    variant?: 'default' | 'danger';
    confirmText?: string;
    children: Snippet;
  } = $props();

  const classes = $derived(
    variant === 'danger'
      ? 'inline-flex items-center gap-2 rounded-lg border border-red-400/50 px-3 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-50'
      : 'inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50'
  );
</script>

<button
  {name}
  {value}
  {disabled}
  formaction="?/lifecycle"
  onclick={(event) => {
    if (confirmText && !globalThis.confirm(confirmText)) event.preventDefault();
  }}
  class={classes}
>
  {#if icon}
    {@const Icon = icon}
    <Icon size={14} />
  {/if}
  {@render children()}
</button>
