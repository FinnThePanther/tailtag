'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState } from 'react';

type Props = {
  conventions: { id: string; name: string }[];
  initial: { status?: string; severity?: string; conventionId?: string };
};

export function ReportFilters({ conventions, initial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [status, setStatus] = useState(initial.status ?? '');
  const [severity, setSeverity] = useState(initial.severity ?? '');
  const [conventionId, setConventionId] = useState(initial.conventionId ?? '');

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(search.toString());
    params.delete('status');
    params.delete('severity');
    params.delete('conventionId');
    if (status) params.set('status', status);
    if (severity) params.set('severity', severity);
    if (conventionId) params.set('conventionId', conventionId);
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname);
  };

  return (
    <form onSubmit={apply} className="grid gap-3 md:grid-cols-3">
      <div>
        <label className="text-sm text-slate-200">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="">Any</option>
          <option value="pending">Pending</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>
      <div>
        <label className="text-sm text-slate-200">Severity</label>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="">Any</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      <div>
        <label className="text-sm text-slate-200">Convention</label>
        <select
          value={conventionId}
          onChange={(e) => setConventionId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="">Any</option>
          {conventions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-3">
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent"
        >
          Apply filters
        </button>
      </div>
    </form>
  );
}
