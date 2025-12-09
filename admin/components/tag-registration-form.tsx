'use client';

import { useState, useTransition } from 'react';

import { registerTagAction } from '@/app/(dashboard)/tags/actions';

export function TagRegistrationForm() {
  const [uid, setUid] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      await registerTagAction({ uid });
      setMessage('Tag registered.');
      setUid('');
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="flex-1">
        <label className="text-sm text-slate-200">Tag UID</label>
        <input
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder="AA:BB:CC:DD or raw hex"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          required
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
      >
        {isPending ? 'Registering…' : 'Register tag'}
      </button>
      {message ? <p className="text-xs text-primary">{message}</p> : null}
    </form>
  );
}
