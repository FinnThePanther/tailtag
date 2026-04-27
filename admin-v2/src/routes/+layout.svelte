<script lang="ts">
  import '../app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>TailTag Admin</title>
  <meta name="description" content="Admin dashboard for TailTag operations" />
</svelte:head>

{@render children()}
