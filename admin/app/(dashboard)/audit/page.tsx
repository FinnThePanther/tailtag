import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { fetchAuditLogs } from '@/lib/data';

export default async function AuditPage() {
  const logs = await fetchAuditLogs(50);

  return (
    <Card
      title="Audit log"
      subtitle="Recent admin actions"
    >
      <Table headers={['Action', 'Entity', 'Actor', 'Context', 'Created']}>
        {logs.map((log) => (
          <tr key={log.id}>
            <td className="px-4 py-3 text-slate-200">{log.action}</td>
            <td className="px-4 py-3 text-slate-200">
              {log.entity_type}
              {log.entity_id ? ` (${log.entity_id})` : ''}
            </td>
            <td className="px-4 py-3 text-slate-200">{log.actor_id}</td>
            <td className="px-4 py-3 text-slate-200">
              {log.context ? JSON.stringify(log.context) : '—'}
            </td>
            <td className="px-4 py-3 text-slate-200">
              {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
            </td>
          </tr>
        ))}
        {!logs.length ? (
          <tr>
            <td
              className="px-4 py-3 text-sm text-muted"
              colSpan={5}
            >
              No audit entries yet.
            </td>
          </tr>
        ) : null}
      </Table>
    </Card>
  );
}
