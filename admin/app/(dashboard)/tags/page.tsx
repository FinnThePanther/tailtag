import Link from 'next/link';

import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { TagRegistrationForm } from '@/components/tag-registration-form';
import { TagActions } from '@/components/tag-actions';
import { fetchTags } from '@/lib/data';

type TagRow = {
  id: string;
  nfc_uid: string | null;
  status: string;
  fursuit_id: string | null;
  registered_by_user_id: string;
  registered_at: string | null;
  linked_at: string | null;
  updated_at: string | null;
  fursuits?: { id: string; name: string | null } | null;
  profiles?: { username: string | null } | null;
  last_scan?: {
    scan_method: string;
    result: string;
    created_at: string;
  } | null;
};

export default async function TagsPage() {
  const tags = (await fetchTags(200)) as TagRow[];

  return (
    <div className="space-y-4">
      <Card title="Register tag" subtitle="Create a pending tag ready to link">
        <TagRegistrationForm />
        <Link href="/tags/scan-logs" className="mt-2 inline-flex text-sm font-semibold text-primary hover:underline">
          View scan logs →
        </Link>
      </Card>

      <Card title="NFC tags" subtitle="Physical tags that are currently registered">
        <TagTable tags={tags.filter((tag) => Boolean(tag.nfc_uid))} emptyMessage="No NFC tags registered yet." />
      </Card>
    </div>
  );
}

function TagTable({ tags, emptyMessage }: { tags: TagRow[]; emptyMessage: string }) {
  return (
    <Table
      headers={[
        'Tag ID',
        'NFC UID',
        'Tag status',
        'Fursuit',
        'Registered by',
        'Registered at',
        'Last scan',
        'Actions',
      ]}
    >
      {tags.map((tag) => (
        <tr key={tag.id}>
          <td className="px-4 py-3 font-mono text-xs text-slate-300">{tag.id}</td>
          <td className="px-4 py-3 font-mono text-slate-100">{tag.nfc_uid ?? '—'}</td>
          <td className="px-4 py-3">
            <StatusBadge status={tag.status} />
          </td>
          <td className="px-4 py-3 text-slate-200">
            {tag.fursuits?.name ? (
              <span>{tag.fursuits.name}</span>
            ) : tag.fursuit_id ? (
              <span className="font-mono">{tag.fursuit_id}</span>
            ) : (
              '—'
            )}
          </td>
          <td className="px-4 py-3 text-slate-200">
            {tag.profiles?.username ?? tag.registered_by_user_id}
          </td>
          <td className="px-4 py-3 text-slate-200">
            {tag.registered_at ? new Date(tag.registered_at).toLocaleDateString() : '—'}
          </td>
          <td className="px-4 py-3 text-slate-200">
            {tag.last_scan ? (
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-200">
                  {tag.last_scan.scan_method.toUpperCase()} • {tag.last_scan.result}
                </span>
                <div className="text-xs text-muted">
                  {new Date(tag.last_scan.created_at).toLocaleString()}
                </div>
              </div>
            ) : (
              '—'
            )}
          </td>
          <td className="px-4 py-3">
            <TagActions
              tagId={tag.id}
              nfcUid={tag.nfc_uid}
              status={tag.status}
              fursuitName={tag.fursuits?.name ?? null}
            />
          </td>
        </tr>
      ))}
      {!tags.length ? (
        <tr>
          <td className="px-4 py-3 text-sm text-muted" colSpan={8}>
            {emptyMessage}
          </td>
        </tr>
      ) : null}
    </Table>
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
