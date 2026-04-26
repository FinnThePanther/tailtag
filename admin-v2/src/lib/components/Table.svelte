<script lang="ts">
  let { headers, children } = $props<{
    headers: string[];
    children: import('svelte').Snippet;
  }>();
</script>

<div class="overflow-hidden rounded-xl border border-border">
  <table class="min-w-full divide-y divide-border/80">
    <thead class="bg-background/40">
      <tr>
        {#each headers as header}
          <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            {header}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody class="divide-y divide-border/80 bg-panel/50">
      {@render children()}
    </tbody>
  </table>
</div>
