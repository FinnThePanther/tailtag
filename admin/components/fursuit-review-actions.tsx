'use client';

import { useState, useTransition } from 'react';

import { reviewFursuitAction } from '@/app/(dashboard)/fursuits/actions';

export function FursuitReviewActions({ queueId }: { queueId: string }) {
  const [status, setStatus] = useState<'approved' | 'rejected' | 'flagged'>('approved');
  const [actionTaken, setActionTaken] = useState<'approved' | 'edited' | 'removed' | 'warned_owner' | ''>('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setMessage(null);
    startTransition(async () => {
      await reviewFursuitAction({
        queueId,
        status,
        notes: notes || null,
        actionTaken: actionTaken || null,
      });
      setMessage('Saved');
    });
  };

  return (
    <div className="flex flex-col gap-2 text-xs text-slate-200">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary"
          >
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="flagged">Flagged</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span>Action</span>
          <select
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value as typeof actionTaken)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary"
          >
            <option value="">None</option>
            <option value="approved">Approved</option>
            <option value="edited">Edited</option>
            <option value="removed">Removed</option>
            <option value="warned_owner">Warned owner</option>
          </select>
        </label>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Moderator notes"
        rows={2}
        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary"
      />
      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="w-fit rounded-lg border border-border px-3 py-1 font-semibold transition hover:border-primary disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Save'}
      </button>
      {message ? <p className="text-primary">{message}</p> : null}
    </div>
  );
}
