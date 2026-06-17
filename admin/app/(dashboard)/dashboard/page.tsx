import Link from 'next/link';
import { ArrowUpRight, Users, ShieldBan, CalendarDays, AlertCircle, Activity } from 'lucide-react';

import { Card } from '@/components/card';
import { Metric } from '@/components/metric';
import {
  fetchBackendWorkerHealth,
  fetchConventions,
  fetchDashboardSummary,
  type BackendWorkerHealthRow,
} from '@/lib/data';
import { requireAdminDataContext } from '@/lib/auth';

export default async function DashboardPage() {
  const { supabase } = await requireAdminDataContext();
  let workerHealthUnavailable = false;
  const [summary, conventions, workerHealth] = await Promise.all([
    fetchDashboardSummary(supabase),
    fetchConventions(supabase),
    fetchBackendWorkerHealth(supabase).catch((error) => {
      console.error('[admin] Failed to load backend worker health', error);
      workerHealthUnavailable = true;
      return [] as BackendWorkerHealthRow[];
    }),
  ]);

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
        title="Backend workers"
        subtitle="Latest durable run records for scheduled and async jobs"
      >
        {workerHealthUnavailable ? (
          <p className="text-sm text-muted">
            Backend worker health is temporarily unavailable. Worker records may still be written.
          </p>
        ) : (
          <div className="divide-y divide-border/80">
            {workerHealth.map((worker) => (
              <div
                key={worker.worker_name}
                className="grid gap-3 py-3 text-sm text-slate-200 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Activity
                      size={15}
                      className="text-primary"
                    />
                    <p className="font-semibold text-white">{worker.display_name}</p>
                    <StatusBadge status={worker.latest_status} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Source {worker.latest_source ?? '—'} · failures in 24h{' '}
                    {worker.recent_failure_count}
                  </p>
                </div>
                <div className="text-xs text-muted">
                  <p>Last run {formatDateTime(worker.latest_started_at)}</p>
                  <p>Last success {formatDateTime(worker.last_success_at)}</p>
                  <p>Last failure {formatDateTime(worker.last_failure_at)}</p>
                </div>
                <div className="min-w-0 text-xs text-muted">
                  <p>Duration {formatDuration(worker.latest_duration_ms)}</p>
                  <p className="truncate">Counts {formatCounts(worker.latest_counts)}</p>
                  {worker.latest_error_message ? (
                    <p className="truncate text-red-200">Error {worker.latest_error_message}</p>
                  ) : null}
                </div>
              </div>
            ))}
            {!workerHealth.length ? (
              <p className="py-3 text-sm text-muted">No backend worker run records yet.</p>
            ) : null}
          </div>
        )}
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

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return '—';
  }

  if (value < 1000) {
    return `${value}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

function formatCounts(counts: Record<string, unknown>): string {
  const entries = Object.entries(counts)
    .filter(([, value]) => typeof value === 'number' && value !== 0)
    .slice(0, 4);

  if (entries.length === 0) {
    return 'none';
  }

  return entries.map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`).join(', ');
}

function StatusBadge({ status }: { status: string | null }) {
  const label = status ?? 'no runs';
  const className =
    status === 'succeeded'
      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
      : status === 'failed'
        ? 'border-red-400/40 bg-red-500/10 text-red-100'
        : status === 'partial'
          ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
          : status === 'running'
            ? 'border-sky-400/40 bg-sky-500/10 text-sky-100'
            : 'border-border bg-background text-muted';

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${className}`}
    >
      {label}
    </span>
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
