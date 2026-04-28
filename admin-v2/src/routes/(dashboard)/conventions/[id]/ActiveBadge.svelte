<script lang="ts">
  let { active }: { active: boolean } = $props();
</script>

<span
  class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
    active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-slate-400'
  }`}
>
  {active ? 'Active' : 'Inactive'}
</span>
