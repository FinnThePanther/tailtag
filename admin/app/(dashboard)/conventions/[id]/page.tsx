import { notFound } from 'next/navigation';
import { Users, MapPin, CalendarRange } from 'lucide-react';

import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { fetchConvention } from '@/lib/data';

export default async function ConventionDetail({ params }: { params: { id: string } }) {
  const { convention, staff } = await fetchConvention(params.id);

  if (!convention) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <Card title={convention.name} subtitle={convention.slug}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Info icon={<CalendarRange size={14} />} label="Dates">
            {convention.start_date
              ? `${convention.start_date} → ${convention.end_date ?? 'TBD'}`
              : 'Dates TBD'}
          </Info>
          <Info icon={<MapPin size={14} />} label="Location">
            {convention.location ?? 'TBD'}
          </Info>
          <Info icon={<Users size={14} />} label="Staff assigned">
            {staff?.length ?? 0}
          </Info>
        </div>
      </Card>

      <Card title="Staff assignments" subtitle="People assigned to this convention">
        <Table headers={['Name', 'Role', 'Status', 'Assigned at', 'Notes']}>
          {staff?.map((assignment) => (
            <tr key={assignment.id}>
              <td className="px-4 py-3 text-slate-200">
                {assignment.profiles?.username ?? 'Unknown'}
              </td>
              <td className="px-4 py-3 capitalize text-slate-200">{assignment.role}</td>
              <td className="px-4 py-3 text-slate-200">{assignment.status}</td>
              <td className="px-4 py-3 text-slate-200">
                {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3 text-slate-200">{assignment.notes ?? '—'}</td>
            </tr>
          ))}
          {!staff?.length ? (
            <tr>
              <td className="px-4 py-3 text-sm text-muted" colSpan={5}>
                No staff assigned yet.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}

function Info({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-slate-200">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-primary">{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <p className="font-semibold text-white">{children}</p>
      </div>
    </div>
  );
}
