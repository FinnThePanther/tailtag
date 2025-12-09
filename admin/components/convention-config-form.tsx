'use client';

import { useState, useTransition } from 'react';

import { updateConventionConfigAction } from '@/app/(dashboard)/conventions/actions';

type Props = {
  conventionId: string;
  catchCooldownSeconds: number;
  catchPoints: number;
  featureTagScan: boolean;
  featureStaffMode: boolean;
};

export function ConventionConfigForm({
  conventionId,
  catchCooldownSeconds,
  catchPoints,
  featureTagScan,
  featureStaffMode,
}: Props) {
  const [cooldown, setCooldown] = useState(catchCooldownSeconds);
  const [points, setPoints] = useState(catchPoints);
  const [tagScan, setTagScan] = useState(featureTagScan);
  const [staffMode, setStaffMode] = useState(featureStaffMode);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      await updateConventionConfigAction({
        conventionId,
        catchCooldownSeconds: Number.isFinite(cooldown) ? cooldown : null,
        catchPoints: Number.isFinite(points) ? points : null,
        featureTagScan: tagScan,
        featureStaffMode: staffMode,
      });
      setMessage('Configuration saved.');
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm text-slate-200">Catch cooldown (seconds)</label>
          <input
            type="number"
            min={0}
            value={cooldown}
            onChange={(e) => setCooldown(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-sm text-slate-200">Catch points</label>
          <input
            type="number"
            min={0}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={tagScan}
            onChange={(e) => setTagScan(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
          />
          Enable tag scanning
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={staffMode}
            onChange={(e) => setStaffMode(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
          />
          Enable Staff Mode for this event
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save config'}
        </button>
        {message ? <p className="text-xs text-primary">{message}</p> : null}
      </div>
    </form>
  );
}
