'use client';

import { useState, useTransition } from 'react';

import { addStaffAssignment } from '@/app/(dashboard)/staff/actions';

export function StaffAssignmentForm({ conventions }: { conventions: { id: string; name: string }[] }) {
  const [profileId, setProfileId] = useState('');
  const [conventionId, setConventionId] = useState(conventions[0]?.id ?? '');
  const [role, setRole] = useState<'staff' | 'organizer'>('staff');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      await addStaffAssignment({
        profileId,
        conventionId,
        role,
        status,
        notes: notes || null,
      });
      setMessage('Staff assigned');
      setProfileId('');
      setNotes('');
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div>
        <label className="text-sm text-slate-200">Profile ID</label>
        <input
          required
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          placeholder="User UUID"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="text-sm text-slate-200">Convention</label>
        <select
          value={conventionId}
          onChange={(e) => setConventionId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          {conventions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-slate-200">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="staff">Staff</option>
          <option value="organizer">Organizer</option>
        </select>
      </div>
      <div>
        <label className="text-sm text-slate-200">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="text-sm text-slate-200">Notes</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional context"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
        />
      </div>
      <div className="flex items-center justify-between md:col-span-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
        >
          {isPending ? 'Assigning…' : 'Assign staff'}
        </button>
        {message ? <p className="text-xs text-primary">{message}</p> : null}
      </div>
    </form>
  );
}
