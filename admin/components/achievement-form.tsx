'use client';

import { useState, useTransition } from 'react';

import {
  grantAchievementAction,
  revokeAchievementAction,
} from '@/app/(dashboard)/achievements/actions';

type Props = {
  achievements: { id: string; name: string; description: string }[];
};

export function AchievementForm({ achievements }: Props) {
  const [userId, setUserId] = useState('');
  const [achievementId, setAchievementId] = useState(achievements[0]?.id ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handle = (fn: () => Promise<void>, text: string) => {
    setMessage(null);
    startTransition(async () => {
      await fn();
      setMessage(text);
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm text-slate-200">User ID</label>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User UUID"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="text-sm text-slate-200">Achievement</label>
        <select
          value={achievementId}
          onChange={(e) => setAchievementId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          {achievements.map((a) => (
            <option
              key={a.id}
              value={a.id}
            >
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || !userId || !achievementId}
          onClick={() => handle(() => grantAchievementAction({ userId, achievementId }), 'Granted')}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
        >
          {isPending ? 'Working…' : 'Grant'}
        </button>
        <button
          type="button"
          disabled={isPending || !userId || !achievementId}
          onClick={() =>
            handle(() => revokeAchievementAction({ userId, achievementId }), 'Revoked')
          }
          className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary disabled:opacity-50"
        >
          Revoke
        </button>
      </div>
      {message ? <p className="text-xs text-primary">{message}</p> : null}
    </div>
  );
}
