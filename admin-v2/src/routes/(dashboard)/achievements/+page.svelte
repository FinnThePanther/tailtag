<script lang="ts">
  import Card from '$lib/components/Card.svelte';

  let { data, form } = $props();
</script>

<Card title="Manual achievements" subtitle="Grant or revoke achievements (audit logged)">
  {#if form?.error}
    <div class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{form.error}</div>
  {:else if form?.message}
    <div class="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
      {form.message}
    </div>
  {/if}
  <form class="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]" method="POST">
    <input
      name="userId"
      required
      placeholder="User ID"
      class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
    />
    <select
      name="achievementId"
      required
      class="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
    >
      {#each data.achievements as achievement}
        <option value={achievement.id}>{achievement.name}</option>
      {/each}
    </select>
    <button
      formaction="?/grant"
      class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent"
    >
      Grant
    </button>
    <button
      formaction="?/revoke"
      class="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary"
    >
      Revoke
    </button>
  </form>
</Card>
