<script lang="ts">
  import { ArrowLeft } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';

  let { form } = $props();
</script>

<div class="space-y-4">
  <a href="/conventions" class="inline-flex items-center gap-1 text-sm text-muted transition hover:text-white"><ArrowLeft size={14} /> Back to conventions</a>
  <Card title="New Convention" subtitle="Create a convention to get started">
    {#if form?.error}<div class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{form.error}</div>{/if}
    <form class="space-y-4" method="POST" action="?/create">
      <div class="grid gap-3 md:grid-cols-2">
        <label class="text-sm text-slate-200">Name<input name="name" required class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
        <label class="text-sm text-slate-200">Slug<input name="slug" required class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
        <label class="text-sm text-slate-200">Start date<input name="startDate" type="date" class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
        <label class="text-sm text-slate-200">End date<input name="endDate" type="date" class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
        <label class="text-sm text-slate-200">Location<input name="location" class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
        <label class="text-sm text-slate-200">Timezone<input name="timezone" value="UTC" class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary" /></label>
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" name="createDefaultGameplayPack" checked class="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary" /> Create default gameplay pack</label>
      <label class="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" name="startImmediately" class="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary" /> Start immediately if ready</label>
      <button class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent">Create convention</button>
    </form>
  </Card>
</div>
