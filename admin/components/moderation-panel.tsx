'use client';

import { useState, useTransition } from 'react';

import { banUserAction, unbanUserAction } from '@/app/(dashboard)/players/actions';

type Scope = 'global' | 'event';

export function ModerationPanel({
  userId,
  isSuspended,
  conventions,
}: {
  userId: string;
  isSuspended: boolean;
  conventions: { id: string; name: string }[];
}) {
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState<number | ''>('');
  const [banScope, setBanScope] = useState<Scope>('global');
  const [banConventionId, setBanConventionId] = useState<string>('');

  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submitBan = () => {
    setStatus(null);
    startTransition(async () => {
      await banUserAction({
        userId,
        reason: banReason || 'Admin ban',
        durationHours: banDuration === '' ? null : Number(banDuration),
        scope: banScope,
        conventionId: banScope === 'event' ? banConventionId : null,
      });
      setStatus('Ban applied');
    });
  };

  const liftBan = () => {
    setStatus(null);
    startTransition(async () => {
      await unbanUserAction({ userId, reason: 'Lifted via admin' });
      setStatus('Ban lifted');
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-panel/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Moderation actions</p>
          <p className="text-xs text-muted">Ban or mute users; writes to audit log.</p>
        </div>
        {status ? <p className="text-xs text-primary">{status}</p> : null}
      </div>

      <div className="space-y-3">
        <ActionBlock
          title="Ban"
          description="Global or event-scoped ban."
          primaryLabel="Apply ban"
          onPrimary={submitBan}
          secondaryLabel={isSuspended ? 'Lift ban' : undefined}
          onSecondary={isSuspended ? liftBan : undefined}
          isPending={isPending}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-slate-200">Reason</label>
              <input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Reason for ban"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-slate-200">
                Duration (hours, blank for permanent)
              </label>
              <input
                value={banDuration}
                onChange={(e) => setBanDuration(e.target.value ? Number(e.target.value) : '')}
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-slate-200">Scope</label>
              <select
                value={banScope}
                onChange={(e) => setBanScope(e.target.value as Scope)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              >
                <option value="global">Global</option>
                <option value="event">Event only</option>
              </select>
            </div>
            {banScope === 'event' ? (
              <div>
                <label className="text-xs text-slate-200">Convention</label>
                <select
                  value={banConventionId}
                  onChange={(e) => setBanConventionId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
                >
                  <option value="">Select convention</option>
                  {conventions.map((c) => (
                    <option
                      key={c.id}
                      value={c.id}
                    >
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </ActionBlock>
      </div>
    </div>
  );
}

function ActionBlock({
  title,
  description,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  isPending,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-background/50 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-muted">{description}</p>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrimary}
          disabled={isPending}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
        >
          {isPending ? 'Saving…' : primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            disabled={isPending}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary disabled:opacity-50"
          >
            {isPending ? 'Working…' : secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
