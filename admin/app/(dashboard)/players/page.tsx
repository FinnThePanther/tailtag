import Link from 'next/link';
import { Shield, UserRound } from 'lucide-react';

import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { fetchConventions, fetchPlayerSearch } from '@/lib/data';
import type { Database } from '@/types/database';
import { PlayerSearchForm } from '@/components/player-search-form';

type SearchParams = {
  q?: string;
  role?: Database['public']['Enums']['user_role'];
  suspended?: 'true' | 'false';
  conventionId?: string;
  page?: string;
};

export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const page = Number(searchParams.page ?? '1') || 1;
  const players = await fetchPlayerSearch({
    search: searchParams.q,
    role: searchParams.role,
    conventionId: searchParams.conventionId,
    isSuspended: searchParams.suspended === undefined ? null : searchParams.suspended === 'true',
    page,
    pageSize: 20,
  });
  const conventions = await fetchConventions();

  return (
    <div className="space-y-4">
      <Card title="Player search" subtitle="Search by username or email">
        <PlayerSearchForm conventions={conventions} initialValues={searchParams} />
      </Card>
      <Card title="Results" subtitle={`Showing ${players.length} players`}>
        <Table headers={['Player', 'Role', 'Status', 'Catches', 'Reports', 'Created', '']}>
          {players.map((player) => (
            <tr key={player.id}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
                    <UserRound size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{player.username ?? 'Unknown'}</p>
                    <p className="text-xs text-muted">{player.email ?? 'No email'}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 capitalize text-slate-200">{player.role}</td>
              <td className="px-4 py-3 text-slate-200">
                {player.is_suspended ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-200">
                    <Shield size={12} /> Suspended
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                    Active
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-200">{player.catch_count}</td>
              <td className="px-4 py-3 text-slate-200">{player.report_count}</td>
              <td className="px-4 py-3 text-slate-200">
                {new Date(player.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/players/${player.id}`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
          {players.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-sm text-muted" colSpan={7}>
                No players found.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}
