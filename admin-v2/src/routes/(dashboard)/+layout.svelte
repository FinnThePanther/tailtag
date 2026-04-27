<script lang="ts">
  import {
    CalendarDays,
    Check,
    ExternalLink,
    FileClock,
    Flag,
    ShieldCheck,
    UserCog,
    Users
  } from 'lucide-svelte';

  let { data, children } = $props();

  const navItems = [
    { href: '/dashboard', label: 'Overview', icon: ShieldCheck },
    { href: '/players', label: 'Players', icon: Users },
    { href: '/conventions', label: 'Conventions', icon: CalendarDays },
    { href: '/staff', label: 'Staff', icon: UserCog },
    { href: '/analytics', label: 'Analytics', icon: ShieldCheck },
    { href: '/achievements', label: 'Achievements', icon: ShieldCheck },
    { href: '/errors', label: 'Errors', icon: ShieldCheck },
    { href: '/checklist', label: 'Pre-Event Checklist', icon: Check },
    { href: '/reports', label: 'Reports', icon: Flag },
    { href: '/audit', label: 'Audit Log', icon: FileClock }
  ];

  const pathname = $derived(data.urlPathname ?? '');
</script>

<div class="flex min-h-screen bg-background">
  <aside class="hidden w-64 flex-col border-r border-border bg-panel/80 px-4 py-6 backdrop-blur md:flex">
    <div class="mb-8">
      <p class="text-xs uppercase tracking-[0.2em] text-muted">TailTag</p>
      <p class="mt-1 text-lg font-semibold text-white">Admin</p>
    </div>
    <nav class="flex-1 space-y-1">
      {#each navItems as item}
        {@const Icon = item.icon}
        {@const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)}
        <a
          href={item.href}
          class={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
            isActive
              ? 'bg-white/5 text-white ring-1 ring-primary/60'
              : 'text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <Icon size={18} class={isActive ? 'text-primary' : 'text-slate-400'} />
          <span>{item.label}</span>
        </a>
      {/each}
    </nav>
    <div class="mt-8 rounded-lg border border-border bg-background px-3 py-2 text-xs text-slate-400">
      <div class="flex items-center gap-2">
        <div class="h-8 w-8 rounded-full bg-white/5"></div>
        <div>
          <div class="text-sm font-semibold text-white">{data.profile.username ?? 'Admin'}</div>
          <div class="capitalize text-muted">{data.profile.role}</div>
        </div>
      </div>
    </div>
  </aside>

  <div class="flex min-h-screen flex-1 flex-col">
    <header class="flex flex-col gap-3 border-b border-border bg-panel/60 px-4 py-4 backdrop-blur md:px-6">
      {#if data.profile.role === 'owner'}
        <div
          class="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-slate-100"
        >
          <span>For infrastructure tasks, jump to Supabase Dashboard.</span>
          <a
            href="https://supabase.com/dashboard/"
            class="inline-flex items-center gap-1 text-primary hover:text-accent"
            target="_blank"
            rel="noreferrer"
          >
            Open Supabase <ExternalLink size={14} />
          </a>
        </div>
      {/if}
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-muted">Signed in as</p>
          <p class="text-lg font-semibold text-white">
            {data.profile.username || data.profile.email || 'Admin'}
          </p>
        </div>
        <form method="POST" action="/logout">
          <button
            type="submit"
            class="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary"
          >
            Sign out
          </button>
        </form>
      </div>
      <nav class="flex gap-2 overflow-x-auto pb-1 md:hidden">
        {#each navItems as item}
          <a href={item.href} class="whitespace-nowrap rounded-lg border border-border px-3 py-2 text-xs text-slate-200">
            {item.label}
          </a>
        {/each}
      </nav>
    </header>
    <main class="flex-1 space-y-6 px-4 py-6 md:px-6">{@render children()}</main>
  </div>
</div>
