import Link from 'next/link';

import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { ReportFilters } from '@/components/report-filters';
import { ReportActions } from '@/components/report-actions';
import { fetchConventions, fetchReports } from '@/lib/data';

type SearchParams = {
  status?: string;
  severity?: string;
  conventionId?: string;
};

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const [reports, conventions] = await Promise.all([
    fetchReports({
      status: searchParams.status,
      severity: searchParams.severity,
      conventionId: searchParams.conventionId,
    }),
    fetchConventions(),
  ]);

  return (
    <div className="space-y-4">
      <Card
        title="Filters"
        subtitle="Triage the queue"
      >
        <ReportFilters
          conventions={conventions}
          initial={searchParams}
        />
      </Card>
      <Card
        title="Reports"
        subtitle={`Total: ${reports.length}`}
      >
        <Table
          headers={['Type', 'Status', 'Reporter', 'Target', 'Description', 'Created', 'Actions']}
        >
          {reports.map((report: any) => {
            const id = (report as any)?.id ?? '';
            const reporter = Array.isArray(report.profiles)
              ? report.profiles[0]?.username
              : (report.profiles as any)?.username;
            const target = Array.isArray(report.reported)
              ? report.reported[0]?.username
              : (report.reported as any)?.username;
            const reportedUserId = report.reported_user_id as string | null;
            const reportedFursuitId = report.reported_fursuit_id as string | null;

            return (
              <tr key={id}>
                <td className="px-4 py-3 text-slate-200">{report.report_type}</td>
                <td className="px-4 py-3 capitalize text-slate-200">{report.status}</td>
                <td className="px-4 py-3 text-slate-200">{reporter ?? report.reporter_id}</td>
                <td className="px-4 py-3 text-slate-200">
                  {reportedUserId ? (
                    <Link
                      href={`/players/${reportedUserId}`}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-slate-100 transition hover:border-primary"
                    >
                      {target ?? reportedUserId}
                    </Link>
                  ) : (
                    <span>{reportedFursuitId ? `Fursuit: ${reportedFursuitId}` : '—'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-200">
                  {report.description ? (
                    <span className="line-clamp-2 max-w-xs text-sm">{report.description}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-200">
                  {report.created_at ? new Date(report.created_at).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3">
                  {report.status === 'resolved' || report.status === 'dismissed' ? (
                    <span className="text-xs text-muted">Closed</span>
                  ) : (
                    <ReportActions reportId={id} />
                  )}
                </td>
              </tr>
            );
          })}
          {!reports.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={7}
              >
                No reports found.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}
