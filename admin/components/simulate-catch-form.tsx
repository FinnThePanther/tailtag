'use client';

import { useState, useTransition } from 'react';

import { simulateCatchAction } from '@/app/(dashboard)/analytics/actions';

type Props = { conventionId: string };

export function SimulateCatchForm({ conventionId }: Props) {
  const [catcherId, setCatcherId] = useState('');
  const [fursuitId, setFursuitId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      await simulateCatchAction({ conventionId, catcherId, fursuitId });
      setMessage('Simulated catch created.');
    });
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 text-sm"
    >
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label className="text-xs text-slate-200">Catcher ID</label>
          <input
            value={catcherId}
            onChange={(e) => setCatcherId(e.target.value)}
            placeholder="User ID"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            required
          />
        </div>
        <div>
          <label className="text-xs text-slate-200">Fursuit ID</label>
          <input
            value={fursuitId}
            onChange={(e) => setFursuitId(e.target.value)}
            placeholder="Fursuit ID"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            required
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary disabled:opacity-50"
      >
        {isPending ? 'Simulating…' : 'Simulate catch'}
      </button>
      {message ? <p className="text-xs text-primary">{message}</p> : null}
    </form>
  );
}
