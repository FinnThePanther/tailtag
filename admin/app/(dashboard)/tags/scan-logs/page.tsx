import Link from 'next/link';

import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { fetchTagScanLogs, fetchTags } from '@/lib/data';

const RESULTS = ['success', 'cooldown', 'invalid', 'not_found', 'lost', 'revoked'];
const METHODS = ['nfc'];

type SearchParams = {
  tagId?: string;
  method?: string;
  result?: string;
  identifier?: string;
};

export default async function TagScanLogsPage({ searchParams }: { searchParams?: SearchParams }) {
  const tagId = typeof searchParams?.tagId === 'string' && searchParams.tagId.length ? searchParams.tagId : null;
  const methodParam = typeof searchParams?.method === 'string' ? searchParams.method : null;
  const resultParam = typeof searchParams?.result === 'string' ? searchParams.result : null;
  const identifier = typeof searchParams?.identifier === 'string' ? searchParams.identifier : null;

  const method = methodParam === 'nfc' ? 'nfc' : null;
  const result = resultParam && RESULTS.includes(resultParam) ? resultParam : null;

  const [logs, tags] = await Promise.all([
    fetchTagScanLogs({
      tagId,
      method,
      result,
      identifier,
      limit: 200,
    }),
    fetchTags(200),
  ]);

  return (
    <div className="space-y-4">
      <Card title="Tag scan logs" subtitle="Search by tag or NFC identifier">
        <form className="grid gap-4 md:grid-cols-4" method="get">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted">Tag</label>
            <select
              name="tagId"
              defaultValue={tagId ?? ''}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-primary"
            >
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.fursuits?.name ?? tag.nfc_uid ?? tag.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted">Method</label>
            <select
              name="method"
              defaultValue={method ?? ''}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-primary"
            >
              <option value="">Any</option>
              {METHODS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted">Result</label>
            <select
              name="result"
              defaultValue={result ?? ''}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-primary"
            >
              <option value="">Any</option>
              {RESULTS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted">Identifier contains</label>
            <input
              name="identifier"
              defaultValue={identifier ?? ''}
              placeholder="AA:BB:CC:DD"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-primary"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent"
            >
              Apply filters
            </button>
            <Link
              href="/tags/scan-logs"
              className="ml-3 text-sm font-semibold text-muted hover:text-primary"
            >
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card title="Recent scans" subtitle="Most recent events first">
        <Table headers={['Time', 'Method', 'Result', 'Identifier', 'Tag', 'Scanner']}>
          {logs.map((log: any) => (
            <tr key={log.id}>
              <td className="px-4 py-3 text-slate-200">{new Date(log.created_at).toLocaleString()}</td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full bg-white/5 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
                  {log.scan_method}
                </span>
              </td>
              <td className="px-4 py-3 capitalize text-slate-200">{log.result}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-300">
                {log.scanned_identifier ?? '—'}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {log.tags?.fursuits?.name ? (
                  <span>{log.tags.fursuits.name}</span>
                ) : log.tags?.nfc_uid ? (
                  <span className="font-mono">{log.tags.nfc_uid}</span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {log.profiles?.username ?? log.scanner_user_id ?? '—'}
              </td>
            </tr>
          ))}
          {!logs.length ? (
            <tr>
              <td className="px-4 py-3 text-sm text-muted" colSpan={6}>
                No scans found for the selected filters.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}
