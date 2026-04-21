'use client';

import { useState, useTransition } from 'react';

import {
  createConventionTaskAction,
  deleteConventionTaskAction,
  toggleConventionTaskAction,
  updateConventionTaskAction,
} from '@/app/(dashboard)/conventions/actions';
import { Card } from '@/components/card';
import { Table } from '@/components/table';
import type { ConventionTaskRow } from '@/lib/data';

const TASK_KINDS = [
  { value: 'catch', label: 'Catch' },
  { value: 'leaderboard', label: 'Leaderboard' },
  { value: 'view_bio', label: 'View bio' },
] as const;

const METRIC_OPTIONS = [
  { value: 'total', label: 'Total count' },
  { value: 'unique', label: 'Unique (deduplicated)' },
] as const;

type TaskFormState = {
  name: string;
  description: string;
  kind: string;
  requirement: number;
  metric: string;
  uniqueBy: string;
  speciesFilter: string;
  colorFilter: string;
};

function defaultFormState(): TaskFormState {
  return {
    name: '',
    description: '',
    kind: TASK_KINDS[0].value,
    requirement: 1,
    metric: 'total',
    uniqueBy: 'payload.fursuit_id',
    speciesFilter: '',
    colorFilter: '',
  };
}

function formStateFromTask(task: ConventionTaskRow): TaskFormState {
  const metadata = task.metadata;
  const filters = Array.isArray(metadata?.filters)
    ? (metadata.filters as Record<string, unknown>[])
    : [];

  const speciesEntry = filters.find((f) => f.path === 'payload.species');
  const colorEntry = filters.find((f) => f.path === 'payload.colors');

  return {
    name: task.name,
    description: task.description ?? '',
    kind: task.kind,
    requirement: task.requirement,
    metric: typeof metadata?.metric === 'string' ? metadata.metric : 'total',
    uniqueBy: typeof metadata?.uniqueBy === 'string' ? metadata.uniqueBy : 'payload.fursuit_id',
    speciesFilter: typeof speciesEntry?.equals === 'string' ? speciesEntry.equals : '',
    colorFilter: Array.isArray(colorEntry?.in) ? (colorEntry.in as string[]).join(', ') : '',
  };
}

function buildMetadata(form: TaskFormState) {
  const filters: { path: string; equals?: string; in?: string[] }[] = [];

  if (form.kind === 'leaderboard') {
    return {
      eventType: 'leaderboard_refreshed',
      metric: 'total',
      includeTutorialCatches: false,
      filters: [],
    };
  }

  if (form.kind === 'view_bio') {
    const metadata: Record<string, unknown> = {
      eventType: 'fursuit_bio_viewed',
      metric: form.metric,
      includeTutorialCatches: false,
      filters: [{ path: 'payload.owner_id', notEqualsUserId: true }],
    };

    if (form.metric === 'unique' && form.uniqueBy.trim()) {
      metadata.uniqueBy = form.uniqueBy.trim();
    }

    return metadata;
  }

  if (form.speciesFilter.trim()) {
    filters.push({ path: 'payload.species', equals: form.speciesFilter.trim() });
  }

  if (form.colorFilter.trim()) {
    const colors = form.colorFilter
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    if (colors.length > 0) {
      filters.push({ path: 'payload.colors', in: colors });
    }
  }

  const metadata: Record<string, unknown> = {
    eventType: 'catch_performed',
    metric: form.metric,
    includeTutorialCatches: false,
    filters,
  };

  if (form.metric === 'unique' && form.uniqueBy.trim()) {
    metadata.uniqueBy = form.uniqueBy.trim();
  }

  return metadata;
}

function summarizeMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const parts: string[] = [];
  if (metadata.metric === 'unique') parts.push('unique');
  const filters = Array.isArray(metadata.filters)
    ? (metadata.filters as Record<string, unknown>[])
    : [];
  for (const f of filters) {
    if (f.path === 'payload.species' && f.equals) parts.push(`species=${f.equals}`);
    if (f.path === 'payload.colors' && Array.isArray(f.in))
      parts.push(`colors=${(f.in as string[]).join(',')}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

type Props = {
  conventionId: string;
  tasks: ConventionTaskRow[];
};

export function ConventionTasksCard({ conventionId, tasks }: Props) {
  const [form, setForm] = useState<TaskFormState>(defaultFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);

  const updateField = <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    startTransition(async () => {
      try {
        const metadata = buildMetadata(form);
        await createConventionTaskAction({
          conventionId,
          name: form.name,
          description: form.description,
          kind: form.kind,
          requirement: form.requirement,
          metadata,
        });
        setForm(defaultFormState());
        setFormSuccess('Task created.');
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to create task.');
      }
    });
  };

  const handleStartEdit = (task: ConventionTaskRow) => {
    setEditingId(task.id);
    setForm(formStateFromTask(task));
    setFormError(null);
    setFormSuccess(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(defaultFormState());
    setFormError(null);
    setFormSuccess(null);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setFormError(null);
    setFormSuccess(null);
    startTransition(async () => {
      try {
        const metadata = buildMetadata(form);
        await updateConventionTaskAction({
          taskId: editingId,
          conventionId,
          name: form.name,
          description: form.description,
          kind: form.kind,
          requirement: form.requirement,
          metadata,
        });
        setEditingId(null);
        setForm(defaultFormState());
        setFormSuccess('Task updated.');
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to update task.');
      }
    });
  };

  const handleToggle = (taskId: string, isActive: boolean) => {
    setActionId(taskId);
    startTransition(async () => {
      try {
        await toggleConventionTaskAction({ taskId, isActive, conventionId });
      } finally {
        setActionId(null);
      }
    });
  };

  const handleDelete = (taskId: string) => {
    if (!confirm('Delete this task? This cannot be undone.')) return;
    setActionId(taskId);
    startTransition(async () => {
      try {
        await deleteConventionTaskAction({ taskId, conventionId });
      } finally {
        setActionId(null);
      }
    });
  };

  const isEditing = editingId !== null;

  return (
    <Card
      title="Convention Daily Tasks"
      subtitle="Tasks added to the rotation for this convention"
    >
      <Table headers={['Name', 'Kind', 'Req.', 'Filters', 'Status', '']}>
        {tasks.map((task) => (
          <tr key={task.id}>
            <td className="px-4 py-3">
              <p className="font-medium text-slate-200">{task.name}</p>
              {task.description ? <p className="text-xs text-muted">{task.description}</p> : null}
            </td>
            <td className="px-4 py-3">
              <span className="rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-slate-300">
                {task.kind}
              </span>
            </td>
            <td className="px-4 py-3 text-sm text-slate-300">{task.requirement}</td>
            <td className="px-4 py-3 text-xs text-slate-400">
              {summarizeMetadata(task.metadata) ?? <span className="text-muted">none</span>}
            </td>
            <td className="px-4 py-3">
              <StatusBadge active={task.is_active} />
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleStartEdit(task)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={isPending && actionId === task.id}
                  onClick={() => handleToggle(task.id, !task.is_active)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
                >
                  {task.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  disabled={isPending && actionId === task.id}
                  onClick={() => handleDelete(task.id)}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:border-red-500 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        ))}
        {tasks.length === 0 ? (
          <tr>
            <td
              className="px-4 py-3 text-sm text-muted"
              colSpan={6}
            >
              No convention tasks yet.
            </td>
          </tr>
        ) : null}
      </Table>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="mb-4 text-sm font-semibold text-white">
          {isEditing ? 'Edit task' : 'Add a task'}
        </h3>
        <form
          onSubmit={isEditing ? handleUpdate : handleCreate}
          className="space-y-3"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g. Catch 5 bird fursuits"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Description</label>
              <input
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Optional description"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-muted">Kind</label>
              <select
                value={form.kind}
                onChange={(e) => updateField('kind', e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              >
                {TASK_KINDS.map((k) => (
                  <option
                    key={k.value}
                    value={k.value}
                  >
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
                value={form.requirement}
                onChange={(e) => updateField('requirement', Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Metric</label>
              <select
                value={form.metric}
                onChange={(e) => updateField('metric', e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              >
                {METRIC_OPTIONS.map((m) => (
                  <option
                    key={m.value}
                    value={m.value}
                  >
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {form.metric === 'unique' ? (
            <div>
              <label className="text-xs text-muted">Unique by (payload path)</label>
              <input
                value={form.uniqueBy}
                onChange={(e) => updateField('uniqueBy', e.target.value)}
                placeholder="payload.fursuit_id"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
              <p className="mt-1 text-xs text-muted">
                Deduplicates events by this field, e.g. payload.fursuit_id for unique suits
              </p>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted">Species filter</label>
              <input
                value={form.speciesFilter}
                onChange={(e) => updateField('speciesFilter', e.target.value)}
                placeholder="e.g. Bird (exact match, case-sensitive)"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Color filter</label>
              <input
                value={form.colorFilter}
                onChange={(e) => updateField('colorFilter', e.target.value)}
                placeholder="e.g. Blue, Red (comma-separated, any match)"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending || !form.name.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
            >
              {isPending
                ? isEditing
                  ? 'Saving…'
                  : 'Creating…'
                : isEditing
                  ? 'Save changes'
                  : 'Create task'}
            </button>
            {isEditing ? (
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isPending}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
              >
                Cancel
              </button>
            ) : null}
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
