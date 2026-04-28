<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { createBrowserSupabaseClient } from '$lib/supabase/client';

  const supabase = createBrowserSupabaseClient();

  let email = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let persistentError = $state<string | null>(null);
  let isSubmitting = $state(false);

  $effect(() => {
    const storedEmail = sessionStorage.getItem('admin_login_email');
    if (storedEmail) {
      email = storedEmail;
    }

    const incomingError = $page.url.searchParams.get('error');
    const existing = incomingError || sessionStorage.getItem('admin_login_error');
    if (existing) {
      persistentError = existing;
      sessionStorage.setItem('admin_login_error', existing);
    }
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    isSubmitting = true;
    error = null;
    persistentError = null;
    sessionStorage.removeItem('admin_login_error');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        error = signInError.message;
        persistentError = signInError.message;
        sessionStorage.setItem('admin_login_error', signInError.message);
        sessionStorage.setItem('admin_login_email', email);
        isSubmitting = false;
        return;
      }

      sessionStorage.removeItem('admin_login_email');
      await goto('/dashboard', { replaceState: true, invalidateAll: true });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'An unexpected error occurred';
      isSubmitting = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-background px-4">
  <div class="w-full max-w-md rounded-2xl border border-border bg-panel p-8 shadow-xl">
    <h1 class="text-2xl font-semibold text-white">TailTag Admin</h1>
    <p class="mt-2 text-sm text-slate-300">Sign in with your admin credentials.</p>
    {#if error || persistentError}
      <div class="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
        {error ?? persistentError ?? 'You do not have access to that page.'}
      </div>
    {/if}
    <form class="mt-6 space-y-4" onsubmit={handleSubmit}>
      <div class="space-y-2">
        <label class="text-sm text-slate-200" for="email">Email</label>
        <input
          id="email"
          type="email"
          required
          bind:value={email}
          class="w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <div class="space-y-2">
        <label class="text-sm text-slate-200" for="password">Password</label>
        <input
          id="password"
          type="password"
          required
          bind:value={password}
          class="w-full rounded-lg border border-border bg-background px-3 py-2 text-slate-100 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        class="flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
      >
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  </div>
</div>
