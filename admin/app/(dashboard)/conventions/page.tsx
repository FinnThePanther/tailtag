import Link from 'next/link';
import { ArrowUpRight, MapPin, Plus } from 'lucide-react';

import { Card } from '@/components/card';
import { fetchConventions } from '@/lib/data';

export default async function ConventionsPage() {
  const conventions = await fetchConventions();

  return (
    <Card
      title="Conventions"
      subtitle="Event list"
      actions={
        <Link
          href="/conventions/new"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
        >
          <Plus size={14} /> Create convention
        </Link>
      }
    >
      <div className="divide-y divide-border/80">
        {conventions.map((convention) => (
          <div
            key={convention.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-white">{convention.name}</p>
                <StatusBadge status={convention.status} />
              </div>
              <p className="text-sm text-muted">
                {convention.start_date
                  ? `${convention.start_date} → ${convention.end_date ?? 'TBD'}`
                  : 'Dates TBD'}
                {convention.location ? (
                  <span className="inline-flex items-center gap-1 pl-2">
                    <MapPin size={14} /> {convention.location}
                  </span>
                ) : null}
              </p>
            </div>
            <Link
              href={`/conventions/${convention.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
            >
              View <ArrowUpRight size={14} />
            </Link>
          </div>
        ))}
        {conventions.length === 0 ? (
          <p className="py-3 text-sm text-muted">No conventions created yet.</p>
        ) : null}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === 'live'
      ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200'
      : status === 'scheduled'
        ? 'border-sky-300/40 bg-sky-400/10 text-sky-200'
        : status === 'draft'
          ? 'border-slate-300/30 bg-white/5 text-slate-200'
          : 'border-amber-300/40 bg-amber-400/10 text-amber-100';

  return (
    <span className={`rounded-lg border px-2 py-0.5 text-xs font-semibold capitalize ${className}`}>
      {status}
    </span>
  );
}
