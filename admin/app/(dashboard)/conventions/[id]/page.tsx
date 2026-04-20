import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Users, MapPin, SlidersHorizontal, ArrowUpRight } from 'lucide-react';

import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { fetchConvention, fetchConventionTasks, fetchConventionAchievements } from '@/lib/data';
import { ConventionConfigForm } from '@/components/convention-config-form';
import { ConventionDetailsForm } from '@/components/convention-details-form';
import { ConventionTasksCard } from '@/components/convention-tasks-card';
import { ConventionAchievementsCard } from '@/components/convention-achievements-card';
import { ConventionLifecycleCard } from '@/components/convention-lifecycle-card';
import {
  buildConventionLifecycleHealth,
  buildConventionReadiness,
} from '@/lib/convention-lifecycle';
import { isDevSupabaseProject } from '@/lib/env';
import { createServiceRoleClient } from '@/lib/supabase/service';

export default async function ConventionDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { startSkipped?: string };
}) {
  const { convention, staff } = await fetchConvention(params.id);

  if (!convention) {
    notFound();
  }

  const supabase = createServiceRoleClient();
  const [tasks, achievements, readiness, health] = await Promise.all([
    fetchConventionTasks(params.id),
    fetchConventionAchievements(params.id),
    buildConventionReadiness(convention, supabase),
    buildConventionLifecycleHealth(convention, supabase),
  ]);

  const config = normalizeConfig(convention.config);
  const startSkippedCopy = getStartSkippedCopy(searchParams?.startSkipped);

  return (
    <div className="space-y-4">
      {startSkippedCopy ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          {startSkippedCopy}
        </div>
      ) : null}

      <ConventionLifecycleCard
        conventionId={convention.id}
        status={convention.status}
        startDate={convention.start_date ?? null}
        endDate={convention.end_date ?? null}
        timezone={convention.timezone ?? 'UTC'}
        closedAt={convention.closed_at ?? null}
        archivedAt={convention.archived_at ?? null}
        closeoutError={convention.closeout_error ?? null}
        closeoutSummary={(convention.closeout_summary as Record<string, unknown> | null) ?? null}
        readiness={readiness}
        health={health}
        showDevDelete={isDevSupabaseProject()}
      />

      <Card
        title="Convention Details"
        subtitle="Basic information about this event"
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-slate-200">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-primary">
              <Users size={14} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Staff assigned</p>
              <p className="font-semibold text-white">{staff?.length ?? 0}</p>
            </div>
          </div>
        }
      >
        <ConventionDetailsForm
          conventionId={convention.id}
          name={convention.name}
          slug={convention.slug}
          startDate={convention.start_date ?? null}
          endDate={convention.end_date ?? null}
          location={convention.location ?? null}
          timezone={convention.timezone ?? 'UTC'}
        />
      </Card>

      <Card
        title="Configuration"
        subtitle="Adjust event rules and feature flags"
        actions={
          <SlidersHorizontal
            size={16}
            className="text-primary"
          />
        }
      >
        <ConventionConfigForm
          conventionId={convention.id}
          catchCooldownSeconds={config.catchCooldownSeconds}
          catchPoints={config.catchPoints}
          featureStaffMode={config.featureStaffMode}
        />
      </Card>

      <Card
        title="Geo-fence"
        subtitle="Manage on-site verification boundaries"
        actions={
          <Link
            href={`/conventions/${convention.id}/location`}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
          >
            Manage map <ArrowUpRight size={14} />
          </Link>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Info
            icon={<MapPin size={14} />}
            label="Status"
          >
            {convention.geofence_enabled ? 'Enabled' : 'Disabled'}
          </Info>
          <Info
            icon={<MapPin size={14} />}
            label="Radius"
          >
            {convention.geofence_radius_meters
              ? `${convention.geofence_radius_meters}m`
              : 'Not configured'}
          </Info>
          <Info
            icon={<MapPin size={14} />}
            label="Verification"
          >
            {convention.location_verification_required ? 'Required on opt-in' : 'Optional'}
          </Info>
        </div>
      </Card>

      <Card
        title="Staff assignments"
        subtitle="People assigned to this convention"
      >
        <Table headers={['Name', 'Role', 'Status', 'Assigned at', 'Notes']}>
          {staff?.map((assignment) => (
            <tr key={assignment.id}>
              <td className="px-4 py-3 text-slate-200">
                {(() => {
                  const profile = Array.isArray(assignment.profiles)
                    ? assignment.profiles[0]
                    : assignment.profiles;
                  return profile?.username ?? 'Unknown';
                })()}
              </td>
              <td className="px-4 py-3 capitalize text-slate-200">{assignment.role}</td>
              <td className="px-4 py-3 text-slate-200">{assignment.status}</td>
              <td className="px-4 py-3 text-slate-200">
                {assignment.assigned_at
                  ? new Date(assignment.assigned_at).toLocaleDateString()
                  : '—'}
              </td>
              <td className="px-4 py-3 text-slate-200">{assignment.notes ?? '—'}</td>
            </tr>
          ))}
          {!staff?.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={5}
              >
                No staff assigned yet.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>

      <ConventionTasksCard
        conventionId={convention.id}
        tasks={tasks}
      />

      <ConventionAchievementsCard
        conventionId={convention.id}
        achievements={achievements}
      />
    </div>
  );
}

function getStartSkippedCopy(reason: string | undefined) {
  switch (reason) {
    case 'before_window':
      return 'Convention created. It was not started because its local start date is still in the future.';
    case 'after_window':
      return 'Convention created. It was not started because its local date window has already ended.';
    case 'not_ready':
      return 'Convention created. It was not started because readiness checks still need attention.';
    default:
      return null;
  }
}

function Info({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-slate-200">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <p className="font-semibold text-white">{children}</p>
      </div>
    </div>
  );
}

function normalizeConfig(raw: any) {
  const catchCooldownSeconds = Number(raw?.cooldowns?.catch_seconds ?? 0);
  const catchPoints = Number(raw?.points?.catch ?? 1);
  const featureStaffMode = Boolean(raw?.feature_flags?.staff_mode ?? true);
  return { catchCooldownSeconds, catchPoints, featureStaffMode };
}
