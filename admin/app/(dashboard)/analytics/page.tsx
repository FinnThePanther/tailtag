import Link from 'next/link';

import { Card } from '@/components/card';
import { Metric } from '@/components/metric';
import { Table } from '@/components/table';
import { fetchConventions } from '@/lib/data';
import { fetchAllConventionAnalytics, fetchCatchModeExperimentResults } from '@/lib/analytics';
import { SimulateCatchForm } from '@/components/simulate-catch-form';

export default async function AnalyticsPage() {
  const conventions = await fetchConventions();
  const [analytics, catchModeExperimentResults] = await Promise.all([
    fetchAllConventionAnalytics(conventions.map((c) => c.id)),
    fetchCatchModeExperimentResults(),
  ]);

  const rows = conventions.map((c) => {
    const stats = analytics.find((a) => a.conventionId === c.id);
    return { ...c, stats };
  });

  const experimentTotals = catchModeExperimentResults.reduce(
    (totals, row) => ({
      assignedProfiles: totals.assignedProfiles + row.assignedProfiles,
      exposedProfiles: totals.exposedProfiles + row.exposedProfiles,
      defaultsApplied: totals.defaultsApplied + row.defaultsApplied,
      switchedAwayProfiles: totals.switchedAwayProfiles + row.switchedAwayProfiles,
    }),
    {
      assignedProfiles: 0,
      exposedProfiles: 0,
      defaultsApplied: 0,
      switchedAwayProfiles: 0,
    },
  );

  return (
    <div className="space-y-4">
      <Card
        title="Analytics"
        subtitle="Event metrics and exports"
      >
        <Table
          headers={['Convention', 'Catches (total)', 'Catches today', 'Pending catches', 'Export']}
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 text-slate-200">
                <div className="flex flex-col">
                  <span className="text-white font-semibold">{row.name}</span>
                  <span className="text-xs text-muted">{row.slug}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-white">{row.stats?.totalCatches ?? 0}</td>
              <td className="px-4 py-3 text-white">{row.stats?.catchesToday ?? 0}</td>
              <td className="px-4 py-3 text-white">{row.stats?.pendingCatches ?? 0}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/api/conventions/${row.id}/catches/export`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
                >
                  Export CSV
                </Link>
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={5}
              >
                No conventions found.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>

      <Card
        title="Catch mode default experiment"
        subtitle="Profile-level auto-catching vs manual approval defaults"
      >
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <Metric
            label="Assigned"
            value={experimentTotals.assignedProfiles}
          />
          <Metric
            label="Exposed"
            value={experimentTotals.exposedProfiles}
          />
          <Metric
            label="Defaults applied"
            value={experimentTotals.defaultsApplied}
          />
          <Metric
            label="Switched away"
            value={experimentTotals.switchedAwayProfiles}
          />
        </div>
        <Table
          headers={[
            'Variant',
            'Assigned',
            'Exposed',
            'Applied',
            'Current auto/manual',
            'Switch away',
            'Fursuits',
            'Catches',
          ]}
        >
          {catchModeExperimentResults.map((row) => (
            <tr key={row.variant}>
              <td className="px-4 py-3 text-slate-200">
                <div className="flex flex-col">
                  <span className="font-semibold text-white">
                    {row.variant === 'manual_default' ? 'Manual default' : 'Auto default'}
                  </span>
                  <span className="text-xs text-muted">{row.experimentKey}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-white">{row.assignedProfiles}</td>
              <td className="px-4 py-3 text-white">{row.exposedProfiles}</td>
              <td className="px-4 py-3 text-white">{row.defaultsApplied}</td>
              <td className="px-4 py-3 text-white">
                {row.currentAutoProfiles} / {row.currentManualProfiles}
              </td>
              <td className="px-4 py-3 text-white">
                {row.switchedAwayProfiles} ({row.switchAwayRate}%)
              </td>
              <td className="px-4 py-3 text-white">{row.fursuitsCreatedAfterExposure}</td>
              <td className="px-4 py-3 text-white">
                <div className="flex flex-col">
                  <span>{row.catchesAfterExposure}</span>
                  <span className="text-xs text-muted">
                    {row.acceptedCatchesAfterExposure} accepted / {row.pendingCatchesAfterExposure}{' '}
                    pending
                  </span>
                </div>
              </td>
            </tr>
          ))}
          {!catchModeExperimentResults.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={8}
              >
                No experiment assignments yet.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>

      {rows.map((row) => (
        <Card
          key={`sim-${row.id}`}
          title={`Simulate catch — ${row.name}`}
          subtitle="Creates an accepted catch for testing (audit logged)"
        >
          <SimulateCatchForm conventionId={row.id} />
        </Card>
      ))}
    </div>
  );
}
