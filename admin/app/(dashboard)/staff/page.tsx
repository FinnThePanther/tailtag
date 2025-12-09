import { Table } from '@/components/table';
import { Card } from '@/components/card';
import { fetchConventions, fetchStaffAssignments } from '@/lib/data';
import { StaffAssignmentForm } from '@/components/staff-assignment-form';
import { StaffRowActions } from '@/components/staff-row-actions';

export default async function StaffPage() {
  const [assignments, conventions] = await Promise.all([fetchStaffAssignments(), fetchConventions()]);

  return (
    <div className="space-y-4">
      <Card title="Assign staff" subtitle="Grant event-scoped access">
        <StaffAssignmentForm conventions={conventions} />
      </Card>

      <Card title="Assignments" subtitle="Current staff per convention">
        <Table headers={['Name', 'Convention', 'Role', 'Status', 'Assigned', '']}>
          {assignments.map((assignment: any) => {
            const id = (assignment as any)?.id ?? '';
            const profile = Array.isArray(assignment.profiles)
              ? assignment.profiles[0]
              : assignment.profiles;
            return (
              <tr key={id}>
                <td className="px-4 py-3 text-slate-200">
                  {profile?.username ?? assignment.profile_id}
                </td>
                <td className="px-4 py-3 text-slate-200">
                  {assignment.conventions?.name ?? assignment.convention_id}
                </td>
                <td className="px-4 py-3 capitalize text-slate-200">{assignment.role}</td>
                <td className="px-4 py-3 text-slate-200">{assignment.status}</td>
                <td className="px-4 py-3 text-slate-200">
                  {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <StaffRowActions assignmentId={id} conventionId={assignment.convention_id} />
                </td>
              </tr>
            );
          })}
          {!assignments.length ? (
            <tr>
              <td className="px-4 py-3 text-sm text-muted" colSpan={6}>
                No staff assignments yet.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}
