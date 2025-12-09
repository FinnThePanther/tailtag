'use client';

import { useState, useTransition } from 'react';

import {
  linkTagAction,
  unlinkTagAction,
  markTagLostAction,
  markTagFoundAction,
} from '@/app/(dashboard)/tags/actions';

type Props = { uid: string; status: string; fursuitName?: string | null };

export function TagActions({ uid, status, fursuitName }: Props) {
  const [fursuitId, setFursuitId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const doAction = (fn: () => Promise<void>, success: string) => {
    setMessage(null);
    startTransition(async () => {
      await fn();
      setMessage(success);
    });
  };

  return (
    <div className="flex flex-col gap-2 text-xs text-slate-200">
      <div className="flex gap-2">
        <input
          value={fursuitId}
          onChange={(e) => setFursuitId(e.target.value)}
          placeholder="Fursuit ID"
          className="w-40 rounded-lg border border-border bg-background px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={isPending || !fursuitId}
          onClick={() => doAction(() => linkTagAction({ uid, fursuitId }), 'Linked')}
          className="rounded-lg border border-border px-2 py-1 font-semibold transition hover:border-primary disabled:opacity-50"
        >
          {isPending ? 'Working…' : 'Link'}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => doAction(() => unlinkTagAction({ uid }), 'Unlinked')}
          className="rounded-lg border border-border px-2 py-1 font-semibold transition hover:border-primary disabled:opacity-50"
        >
          Unlink
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => doAction(() => markTagLostAction({ uid }), 'Marked lost')}
          className="rounded-lg border border-red-500/60 px-2 py-1 font-semibold text-red-100 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          Lost
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => doAction(() => markTagFoundAction({ uid }), 'Marked active')}
          className="rounded-lg border border-emerald-500/60 px-2 py-1 font-semibold text-emerald-100 transition hover:bg-emerald-500/10 disabled:opacity-50"
        >
          Found
        </button>
      </div>
      {fursuitName ? <p className="text-muted">Linked to: {fursuitName}</p> : null}
      {message ? <p className="text-primary">{message}</p> : null}
      {status ? <p className="text-muted">Status: {status}</p> : null}
    </div>
  );
}
