import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { fetchAdminErrors } from '@/lib/data';

export default async function ErrorsPage() {
  const errors = await fetchAdminErrors(50);

  return (
    <Card title="Admin errors" subtitle="Recent error events captured by admin_error_log">
      <Table headers={['Type', 'Message', 'Severity', 'Convention', 'Occurred']}>
        {errors.map((error) => (
          <tr key={error.id}>
            <td className="px-4 py-3 text-slate-200">{error.error_type}</td>
            <td className="px-4 py-3 text-slate-200">{error.error_message}</td>
            <td className="px-4 py-3 text-slate-200">{error.severity}</td>
            <td className="px-4 py-3 text-slate-200">{error.convention_id ?? '—'}</td>
            <td className="px-4 py-3 text-slate-200">
              {error.occurred_at ? new Date(error.occurred_at).toLocaleString() : '—'}
            </td>
          </tr>
        ))}
        {!errors.length ? (
          <tr>
            <td className="px-4 py-3 text-sm text-muted" colSpan={5}>
              No errors logged.
            </td>
          </tr>
        ) : null}
      </Table>
    </Card>
  );
}
