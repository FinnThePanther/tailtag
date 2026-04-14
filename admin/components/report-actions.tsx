'use client';

import { useState, useTransition } from 'react';

import { resolveReportAction } from '@/app/(dashboard)/reports/actions';

export function ReportActions({ reportId }: { reportId: string }) {
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const act = (status: 'resolved' | 'dismissed') => {
    setMessage(null);
    startTransition(async () => {
      await resolveReportAction({ reportId, status, resolutionNotes: notes || null });
      setMessage(status === 'resolved' ? 'Resolved' : 'Dismissed');
    });
  };

  return (
    <div className="flex flex-col gap-2 text-xs text-slate-200">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Resolution notes"
        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => act('resolved')}
          disabled={isPending}
          className="rounded-lg border border-emerald-500/60 px-3 py-1 font-semibold text-emerald-100 transition hover:bg-emerald-500/10 disabled:opacity-50"
        >
          Resolve
        </button>
        <button
          type="button"
          onClick={() => act('dismissed')}
          disabled={isPending}
          className="rounded-lg border border-red-500/60 px-3 py-1 font-semibold text-red-100 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
      {message ? <p className="text-primary">{message}</p> : null}
    </div>
  );
}
