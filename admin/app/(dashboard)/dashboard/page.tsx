import Link from 'next/link';
import { ArrowUpRight, Users, ShieldBan, CalendarDays, AlertCircle } from 'lucide-react';

import { Card } from '@/components/card';
import { Metric } from '@/components/metric';
import { fetchConventions, fetchDashboardSummary } from '@/lib/data';

export default async function DashboardPage() {
  const [summary, conventions] = await Promise.all([fetchDashboardSummary(), fetchConventions()]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric
          label="Players"
          value={summary.totalPlayers}
          icon={
            <Users
              size={16}
              className="text-primary"
            />
          }
        />
        <Metric
          label="Suspended"
          value={summary.suspendedPlayers}
          hint="Active bans"
          icon={
            <ShieldBan
              size={16}
              className="text-primary"
            />
          }
        />
        <Metric
          label="Conventions"
          value={summary.activeConventions}
          icon={
            <CalendarDays
              size={16}
              className="text-primary"
            />
          }
        />
        <Metric
          label="Pending reports"
          value={summary.pendingReports}
          icon={
            <AlertCircle
              size={16}
              className="text-primary"
            />
          }
        />
      </div>

      <Card
        title="Conventions"
        subtitle="Event overview with quick links"
      >
        <div className="divide-y divide-border/80">
          {conventions.length === 0 ? (
            <p className="py-4 text-sm text-muted">No conventions yet.</p>
          ) : (
            conventions.map((convention) => (
              <div
                key={convention.id}
                className="flex items-center justify-between gap-3 py-3 text-sm text-slate-200"
              >
                <div>
                  <p className="font-semibold text-white">{convention.name}</p>
                  <p className="text-muted">
                    {convention.start_date
                      ? `${convention.start_date} → ${convention.end_date ?? 'TBD'}`
                      : 'Dates TBD'}
                    {convention.location ? ` • ${convention.location}` : ''}
                  </p>
                </div>
                <Link
                  href={`/conventions/${convention.id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
                >
                  View <ArrowUpRight size={14} />
                </Link>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card
        title="Quick actions"
        subtitle="Get to common flows fast"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickLink
            href="/players"
            label="Player search"
            description="Find players across events"
          />
          <QuickLink
            href="/staff"
            label="Staff assignments"
            description="Manage event staff access"
          />
          <QuickLink
            href="/audit"
            label="Audit log"
            description="Review recent admin activity"
          />
        </div>
      </Card>
    </div>
  );
}

function QuickLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-xl border border-border bg-panel/60 p-4 transition hover:border-primary"
    >
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-white">{label}</p>
        <ArrowUpRight
          size={16}
          className="text-primary"
        />
      </div>
      <p className="text-sm text-muted">{description}</p>
    </Link>
  );
}
