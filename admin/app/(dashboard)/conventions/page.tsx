import Link from 'next/link';
import { ArrowUpRight, MapPin, Plus } from 'lucide-react';

import { Card } from '@/components/card';
import {
  formatRecommendedAction,
  HealthBadge,
  StatusBadge,
} from '@/components/convention-lifecycle-ui';
import { fetchConventions } from '@/lib/data';
import { buildConventionLifecycleHealth } from '@/lib/convention-lifecycle';
import { createServiceRoleClient } from '@/lib/supabase/service';

export default async function ConventionsPage() {
  const conventions = await fetchConventions();
  const supabase = createServiceRoleClient();
  const healthByConvention = new Map(
    await Promise.all(
      conventions.map(
        async (convention) =>
          [convention.id, await buildConventionLifecycleHealth(convention, supabase)] as const,
      ),
    ),
  );

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
        {conventions.map((convention) => {
          const health = healthByConvention.get(convention.id);
          return (
            <div
              key={convention.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-white">{convention.name}</p>
                  <StatusBadge status={convention.status} />
                  {health ? <HealthBadge severity={health.severity} /> : null}
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
                {health && health.warnings.length > 0 ? (
                  <p className="text-xs text-amber-100">
                    {health.warnings[0]}
                    <span className="font-semibold">
                      {' '}
                      {formatRecommendedAction(health.recommendedAction)}
                    </span>
                  </p>
                ) : null}
              </div>
              <Link
                href={`/conventions/${convention.id}`}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
              >
                View <ArrowUpRight size={14} />
              </Link>
            </div>
          );
        })}
        {conventions.length === 0 ? (
          <p className="py-3 text-sm text-muted">No conventions created yet.</p>
        ) : null}
      </div>
    </Card>
  );
}
