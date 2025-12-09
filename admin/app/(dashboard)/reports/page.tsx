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
      <Card title="Filters" subtitle="Triage the queue">
        <ReportFilters conventions={conventions} initial={searchParams} />
      </Card>
      <Card title="Reports" subtitle={`Total: ${reports.length}`}>
        <Table headers={['Type', 'Severity', 'Status', 'Reporter', 'Target', 'Created', 'Actions']}>
        {reports.map((report: any) => {
          const id = (report as any)?.id ?? '';
          const reporter = Array.isArray(report.profiles)
            ? report.profiles[0]?.username
            : (report.profiles as any)?.username;
          const target = Array.isArray(report.reported)
            ? report.reported[0]?.username
            : (report.reported as any)?.username;

          return (
            <tr key={id}>
              <td className="px-4 py-3 text-slate-200">{report.report_type}</td>
              <td className="px-4 py-3 capitalize text-slate-200">{report.severity}</td>
              <td className="px-4 py-3 capitalize text-slate-200">{report.status}</td>
              <td className="px-4 py-3 text-slate-200">{reporter ?? report.reporter_id}</td>
              <td className="px-4 py-3 text-slate-200">
                {target ?? report.reported_user_id ?? report.reported_fursuit_id ?? '—'}
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
              <td className="px-4 py-3 text-sm text-muted" colSpan={7}>
                No reports found.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}
