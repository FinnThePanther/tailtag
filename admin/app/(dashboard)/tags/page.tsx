import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { TagRegistrationForm } from '@/components/tag-registration-form';
import { TagActions } from '@/components/tag-actions';
import { fetchTagActivity, fetchTags } from '@/lib/data';

export default async function TagsPage() {
  const tags = await fetchTags(100);

  const tagsWithActivity = await Promise.all(
    tags.map(async (tag) => {
      const activity = await fetchTagActivity(tag.uid).catch(() => null);
      return { ...tag, last_activity: activity };
    })
  );

  return (
    <div className="space-y-4">
      <Card title="Register tag" subtitle="Create a pending tag ready to link">
        <TagRegistrationForm />
      </Card>

      <Card title="NFC tags" subtitle="Latest updates">
        <Table headers={['UID', 'Status', 'Fursuit', 'Registered by', 'Registered at', 'Last seen', 'Actions']}>
          {tagsWithActivity.map((tag) => (
            <tr key={tag.uid}>
              <td className="px-4 py-3 font-mono text-slate-100">{tag.uid}</td>
              <td className="px-4 py-3">
                <StatusBadge status={tag.status} />
              </td>
              <td className="px-4 py-3 text-slate-200">
                {tag.fursuits?.name ?? tag.fursuit_id ?? '—'}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {tag.profiles?.username ?? tag.registered_by_user_id}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {tag.registered_at ? new Date(tag.registered_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {tag.last_activity?.seen_at
                  ? new Date(tag.last_activity.seen_at as string).toLocaleString()
                  : '—'}
              </td>
              <td className="px-4 py-3">
                <TagActions uid={tag.uid} status={tag.status} fursuitName={tag.fursuits?.name ?? null} />
              </td>
            </tr>
          ))}
          {!tagsWithActivity.length ? (
            <tr>
              <td className="px-4 py-3 text-sm text-muted" colSpan={7}>
                No tags registered yet.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold';
  switch (status) {
    case 'active':
      return <span className={`${base} bg-emerald-500/10 text-emerald-200`}>Active</span>;
    case 'pending_link':
      return <span className={`${base} bg-amber-500/10 text-amber-200`}>Pending</span>;
    case 'lost':
      return <span className={`${base} bg-red-500/10 text-red-200`}>Lost</span>;
    case 'revoked':
      return <span className={`${base} bg-slate-500/10 text-slate-200`}>Revoked</span>;
    default:
      return <span className={`${base} bg-slate-500/10 text-slate-200`}>{status}</span>;
  }
}
