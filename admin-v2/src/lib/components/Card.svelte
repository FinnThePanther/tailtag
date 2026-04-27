<script lang="ts">
  let { title, subtitle = undefined, actions, children } = $props<{
    title: string;
    subtitle?: string;
    actions?: import('svelte').Snippet;
    children: import('svelte').Snippet;
  }>();
</script>

<div class="rounded-2xl border border-border bg-panel/80 p-5 shadow-lg">
  <div class="mb-4 flex items-start justify-between gap-3">
    <div>
      <h2 class="text-lg font-semibold text-white">{title}</h2>
      {#if subtitle}
        <p class="text-sm text-muted">{subtitle}</p>
      {/if}
    </div>
    {#if actions}
      {@render actions()}
    {/if}
  </div>
  {@render children()}
</div>
