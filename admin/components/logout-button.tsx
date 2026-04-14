'use client';

import { useTransition } from 'react';

import { signOut } from '@/app/(dashboard)/actions';

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => signOut())}
      disabled={isPending}
      className="rounded-lg border border-border px-3 py-1.5 text-sm text-slate-200 transition hover:border-primary hover:text-white disabled:opacity-50"
    >
      {isPending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
