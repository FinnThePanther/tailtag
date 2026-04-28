<script lang="ts">
  import { onMount } from 'svelte';
  import { CheckCircle, Circle } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';

  const STORAGE_KEY = 'admin_pre_event_checklist_v1';
  const items = [
    'Create convention and verify dates',
    'Configure catch cooldowns and points',
    'Assign event staff',
    'Generate gameplay pack',
    'Enable geofence if needed',
    'Run readiness check',
    'Start convention'
  ];
  let checked = $state<Record<string, boolean>>({});

  onMount(() => {
    checked = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  });

  function toggle(item: string) {
    checked = { ...checked, [item]: !checked[item] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
  }
</script>

<Card title="Pre-Event Checklist" subtitle="Local checklist for launch readiness">
  <div class="divide-y divide-border/80">
    {#each items as item}
      <button type="button" onclick={() => toggle(item)} class="flex w-full items-center gap-3 py-3 text-left text-sm text-slate-200">
        {#if checked[item]}<CheckCircle size={18} class="text-primary" />{:else}<Circle size={18} class="text-slate-500" />{/if}
        <span class={checked[item] ? 'text-muted line-through' : ''}>{item}</span>
      </button>
    {/each}
  </div>
</Card>
