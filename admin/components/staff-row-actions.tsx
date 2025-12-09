'use client';

import { useTransition } from 'react';

import { removeStaffAssignment } from '@/app/(dashboard)/staff/actions';

export function StaffRowActions({ assignmentId, conventionId }: { assignmentId: string; conventionId: string }) {
  const [isPending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      await removeStaffAssignment({ assignmentId, conventionId });
    });

  return (
    <button
      type="button"
      onClick={remove}
      disabled={isPending}
      className="rounded-lg border border-red-500/60 px-3 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-500/10 disabled:opacity-50"
    >
      {isPending ? 'Removing…' : 'Remove'}
    </button>
  );
}
