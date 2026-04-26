<script lang="ts">
  import { enhance } from '$app/forms';
  import Card from '$lib/components/Card.svelte';

  let { data, form } = $props();
  let userId = $state('');
  let achievementId = $state('');
  let pendingAction = $state<string | null>(null);
  let initializedAchievements = $state(false);

  $effect(() => {
    if (!initializedAchievements && data.achievements[0]?.id) {
      achievementId = data.achievements[0].id;
      initializedAchievements = true;
    }
  });
</script>

<Card title="Manual achievements" subtitle="Grant or revoke achievements (audit logged)">
  {#if form?.error}
    <div class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{form.error}</div>
  {:else if form?.message}
    <div class="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
      {form.message}
    </div>
  {/if}
  <form
    class="space-y-3"
    method="POST"
    use:enhance={({ submitter }) => {
      pendingAction = submitter?.getAttribute('data-action') ?? 'achievement';
      return async ({ update }) => {
        pendingAction = null;
        await update();
      };
    }}
  >
    <div>
      <label class="text-sm text-slate-200" for="userId">User ID</label>
      <input
        id="userId"
        name="userId"
        bind:value={userId}
        placeholder="User UUID"
        class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
      />
    </div>
    <div>
      <label class="text-sm text-slate-200" for="achievementId">Achievement</label>
      <select
        id="achievementId"
        name="achievementId"
        bind:value={achievementId}
        class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
      >
        {#each data.achievements as achievement}
          <option value={achievement.id}>{achievement.name}</option>
        {/each}
      </select>
    </div>
    <div class="flex gap-2">
      <button
        type="submit"
        formaction="?/grant"
        data-action="grant"
        disabled={pendingAction !== null || !userId || !achievementId}
        class="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
      >
        {pendingAction ? 'Working...' : 'Grant'}
      </button>
      <button
        type="submit"
        formaction="?/revoke"
        data-action="revoke"
        disabled={pendingAction !== null || !userId || !achievementId}
        class="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary disabled:opacity-50"
      >
        Revoke
      </button>
    </div>
  </form>
</Card>
