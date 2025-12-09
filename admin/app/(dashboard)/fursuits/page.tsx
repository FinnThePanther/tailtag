import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { FursuitReviewActions } from '@/components/fursuit-review-actions';
import { fetchFursuitQueue } from '@/lib/data';

export default async function FursuitQueuePage() {
  const queue = await fetchFursuitQueue(50);

  return (
    <Card title="Fursuit moderation queue" subtitle="Approve or reject flagged submissions">
      <Table headers={['Fursuit', 'Flag reason', 'Status', 'Flagged by', 'Created', 'Actions']}>
        {queue.map((item: any) => {
          const id = (item as any)?.id ?? '';
          return (
            <tr key={id}>
              <td className="px-4 py-3 text-slate-200">
                {item.fursuits?.name ?? item.fursuit_id ?? 'Unknown'}
              </td>
              <td className="px-4 py-3 text-slate-200">{item.flag_reason}</td>
              <td className="px-4 py-3 text-slate-200">{item.status}</td>
              <td className="px-4 py-3 text-slate-200">
                {item.flagger?.username ?? item.flagged_by_user_id ?? '—'}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}
              </td>
              <td className="px-4 py-3">
                <FursuitReviewActions queueId={id} />
              </td>
            </tr>
          );
        })}
        {!queue.length ? (
          <tr>
            <td className="px-4 py-3 text-sm text-muted" colSpan={6}>
              No fursuits awaiting review.
            </td>
          </tr>
        ) : null}
      </Table>
    </Card>
  );
}
