'use client';

import { useState, useTransition } from 'react';

import {
  createConventionTaskAction,
  toggleConventionTaskAction,
} from '@/app/(dashboard)/conventions/actions';
import { Card } from '@/components/card';
import { Table } from '@/components/table';
import type { ConventionTaskRow } from '@/lib/data';

const TASK_KINDS = [
  { value: 'catch', label: 'Catch' },
  { value: 'leaderboard', label: 'Leaderboard' },
  { value: 'profile', label: 'Profile' },
] as const;

type Props = {
  conventionId: string;
  tasks: ConventionTaskRow[];
};

export function ConventionTasksCard({ conventionId, tasks }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<string>(TASK_KINDS[0].value);
  const [requirement, setRequirement] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    startTransition(async () => {
      try {
        await createConventionTaskAction({ conventionId, name, description, kind, requirement });
        setName('');
        setDescription('');
        setKind(TASK_KINDS[0].value);
        setRequirement(1);
        setFormSuccess('Task created.');
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to create task.');
      }
    });
  };

  const handleToggle = (taskId: string, isActive: boolean) => {
    setTogglingId(taskId);
    startTransition(async () => {
      try {
        await toggleConventionTaskAction({ taskId, isActive, conventionId });
      } finally {
        setTogglingId(null);
      }
    });
  };

  return (
    <Card title="Convention Daily Tasks" subtitle="Tasks added to the rotation for this convention">
      <Table headers={['Name', 'Kind', 'Requirement', 'Status', '']}>
        {tasks.map((task) => (
          <tr key={task.id}>
            <td className="px-4 py-3">
              <p className="font-medium text-slate-200">{task.name}</p>
              {task.description ? (
                <p className="text-xs text-muted">{task.description}</p>
              ) : null}
            </td>
            <td className="px-4 py-3">
              <span className="rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-slate-300">
                {task.kind}
              </span>
            </td>
            <td className="px-4 py-3 text-sm text-slate-300">{task.requirement}</td>
            <td className="px-4 py-3">
              <StatusBadge active={task.is_active} />
            </td>
            <td className="px-4 py-3 text-right">
              <button
                type="button"
                disabled={isPending && togglingId === task.id}
                onClick={() => handleToggle(task.id, !task.is_active)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
              >
                {task.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </td>
          </tr>
        ))}
        {tasks.length === 0 ? (
          <tr>
            <td className="px-4 py-3 text-sm text-muted" colSpan={5}>
              No convention tasks yet.
            </td>
          </tr>
        ) : null}
      </Table>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="mb-4 text-sm font-semibold text-white">Add a task</h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Catch 5 suiters at this con"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted">Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              >
                {TASK_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">Requirement</label>
              <input
                type="number"
                min={1}
                value={requirement}
                onChange={(e) => setRequirement(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create task'}
            </button>
            {formSuccess ? <p className="text-xs text-primary">{formSuccess}</p> : null}
            {formError ? <p className="text-xs text-red-400">{formError}</p> : null}
          </div>
        </form>
      </div>
    </Card>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-slate-400'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
