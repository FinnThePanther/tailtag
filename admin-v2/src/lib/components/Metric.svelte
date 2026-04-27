<script lang="ts">
  let { label, value, hint = undefined, children } = $props<{
    label: string;
    value: string | number;
    hint?: string;
    children?: import('svelte').Snippet;
  }>();
</script>

<div class="rounded-xl border border-border bg-background/60 p-4">
  <div class="flex items-center justify-between gap-2">
    <p class="text-sm text-muted">{label}</p>
    {#if children}
      {@render children()}
    {/if}
  </div>
  <p class="mt-2 text-2xl font-semibold text-white">{value}</p>
  {#if hint}
    <p class="text-xs text-muted">{hint}</p>
  {/if}
</div>
