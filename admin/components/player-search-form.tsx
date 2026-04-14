'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import type { Database } from '@/types/database';

type Props = {
  conventions: { id: string; name: string }[];
  initialValues: {
    q?: string;
    role?: Database['public']['Enums']['user_role'];
    suspended?: string;
    conventionId?: string;
  };
};

export function PlayerSearchForm({ conventions, initialValues }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialValues.q ?? '');
  const [role, setRole] = useState<Database['public']['Enums']['user_role'] | ''>(
    initialValues.role ?? '',
  );
  const [suspended, setSuspended] = useState(initialValues.suspended ?? '');
  const [conventionId, setConventionId] = useState(initialValues.conventionId ?? '');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (role) params.set('role', role);
    if (suspended) params.set('suspended', suspended);
    if (conventionId) params.set('conventionId', conventionId);
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 md:grid-cols-4"
    >
      <div className="md:col-span-2">
        <label className="text-sm text-slate-200">Search</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Username or email"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="text-sm text-slate-200">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="">Any</option>
          <option value="owner">Owner</option>
          <option value="organizer">Organizer</option>
          <option value="staff">Staff</option>
          <option value="moderator">Moderator</option>
          <option value="player">Player</option>
        </select>
      </div>
      <div>
        <label className="text-sm text-slate-200">Suspended</label>
        <select
          value={suspended}
          onChange={(e) => setSuspended(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-200">Convention</label>
        <select
          value={conventionId}
          onChange={(e) => setConventionId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="">Any</option>
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
      <div className="flex items-end md:col-span-2">
        <button
          type="submit"
          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent"
        >
          Search
        </button>
      </div>
    </form>
  );
}
