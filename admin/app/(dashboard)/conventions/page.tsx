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
              <p className="text-base font-semibold text-white">{convention.name}</p>
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
