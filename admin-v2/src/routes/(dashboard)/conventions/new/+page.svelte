<script lang="ts">
  import { enhance } from '$app/forms';
  import { ArrowLeft } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';

  let { form } = $props();

  const TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Sydney',
    'Australia/Sydney'
  ];

  let name = $state('');
  let slug = $state('');
  let slugEdited = $state(false);
  let startDate = $state('');
  let endDate = $state('');
  let location = $state('');
  let timezone = $state('UTC');
  let createDefaultGameplayPack = $state(true);
  let startImmediately = $state(false);
  let isPending = $state(false);

  function toSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  function handleNameChange() {
    if (!slugEdited) {
      slug = toSlug(name);
    }
  }

  function handleSlugChange() {
    slugEdited = true;
  }
</script>

<div class="space-y-4">
  <a
    href="/conventions"
    class="inline-flex items-center gap-1 text-sm text-muted transition hover:text-white"
  >
    <ArrowLeft size={14} /> Back to conventions
  </a>
  <Card title="New Convention" subtitle="Create a convention to get started">
    <form
      class="space-y-4"
      method="POST"
      action="?/create"
      use:enhance={() => {
        isPending = true;
        return async ({ update }) => {
          isPending = false;
          await update();
        };
      }}
    >
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="text-sm text-slate-200" for="name">Convention name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            bind:value={name}
            oninput={handleNameChange}
            placeholder="e.g. FurFest 2026"
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-muted focus:border-primary"
          />
        </div>
        <div>
          <label class="text-sm text-slate-200" for="slug">Slug</label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            bind:value={slug}
            oninput={handleSlugChange}
            placeholder="e.g. furfest-2026"
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-muted focus:border-primary"
          />
          <p class="mt-1 text-xs text-muted">Lowercase letters, numbers, and hyphens only.</p>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="text-sm text-slate-200" for="startDate">Start date</label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            bind:value={startDate}
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </div>
        <div>
          <label class="text-sm text-slate-200" for="endDate">End date</label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            bind:value={endDate}
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="text-sm text-slate-200" for="location">Location</label>
          <input
            id="location"
            name="location"
            type="text"
            bind:value={location}
            placeholder="e.g. Convention Center, City, State"
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-muted focus:border-primary"
          />
        </div>
        <div>
          <label class="text-sm text-slate-200" for="timezone">Timezone</label>
          <select
            id="timezone"
            name="timezone"
            bind:value={timezone}
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          >
            {#each TIMEZONES as tz}
              <option value={tz}>{tz}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <label
          class="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-3 text-sm text-slate-200"
        >
          <input
            type="checkbox"
            name="createDefaultGameplayPack"
            bind:checked={createDefaultGameplayPack}
            class="mt-1"
          />
          <span>
            <span class="block font-semibold text-white">Create default gameplay pack</span>
            <span class="text-xs text-muted">
              Adds starter daily tasks and convention achievements.
            </span>
          </span>
        </label>
        <label
          class="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-3 text-sm text-slate-200"
        >
          <input
            type="checkbox"
            name="startImmediately"
            bind:checked={startImmediately}
            class="mt-1"
          />
          <span>
            <span class="block font-semibold text-white">
              Start immediately if within date window
            </span>
            <span class="text-xs text-muted">
              Future ready conventions are scheduled but still require a manual start.
            </span>
          </span>
        </label>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
        >
          {isPending ? 'Creating...' : 'Create convention'}
        </button>
        {#if form?.error}
          <p class="text-xs text-red-400">{form.error}</p>
        {/if}
      </div>
    </form>
  </Card>
</div>
