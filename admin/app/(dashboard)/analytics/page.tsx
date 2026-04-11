import Link from 'next/link';

import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { fetchConventions } from '@/lib/data';
import { fetchAllConventionAnalytics } from '@/lib/analytics';
import { SimulateCatchForm } from '@/components/simulate-catch-form';

export default async function AnalyticsPage() {
  const conventions = await fetchConventions();
  const analytics = await fetchAllConventionAnalytics(conventions.map((c) => c.id));

  const rows = conventions.map((c) => {
    const stats = analytics.find((a) => a.conventionId === c.id);
    return { ...c, stats };
  });

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
