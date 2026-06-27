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
  { value: 'share', label: 'Share' },
] as const;

const METRIC_OPTIONS = [
  { value: 'total', label: 'Total count' },
  { value: 'unique', label: 'Unique (deduplicated)' },
] as const;

const ROTATION_SLOTS = [
  { value: 'catch', label: 'Catch' },
  { value: 'explore', label: 'Explore' },
  { value: 'leaderboard', label: 'Leaderboard' },
  { value: 'social', label: 'Social' },
  { value: 'special', label: 'Special' },
] as const;

const ROTATION_DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'special', label: 'Special' },
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
  rotationEligible: boolean;
  rotationSlot: string;
  rotationDifficulty: string;
  rotationFamily: string;
  levelingXp: number;
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
    rotationEligible: true,
    rotationSlot: 'catch',
    rotationDifficulty: 'easy',
    rotationFamily: 'catch_volume',
    levelingXp: 25,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordFrom(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function defaultRotationSlotForKind(kind: string) {
  if (kind === 'leaderboard') return 'leaderboard';
  if (kind === 'view_bio') return 'explore';
  if (kind === 'share') return 'social';
  return 'catch';
}

function defaultRotationFamilyForKind(kind: string) {
  if (kind === 'leaderboard') return 'leaderboard_check';
  if (kind === 'view_bio') return 'bio_views';
  if (kind === 'share') return 'share_catch';
  return 'catch_volume';
}

function normalizeRotationSlot(value: unknown, kind: string) {
  return ROTATION_SLOTS.some((option) => option.value === value)
    ? (value as string)
    : defaultRotationSlotForKind(kind);
}

function normalizeRotationDifficulty(value: unknown) {
  return ROTATION_DIFFICULTIES.some((option) => option.value === value)
    ? (value as string)
    : 'medium';
}

function normalizeRotationFamily(value: unknown, kind: string) {
  if (typeof value !== 'string') {
    return defaultRotationFamilyForKind(kind);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : defaultRotationFamilyForKind(kind);
}

function normalizeLevelingXp(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 50;
  }
  return Math.max(1, Math.min(500, Math.trunc(value)));
}

function formStateFromTask(task: ConventionTaskRow): TaskFormState {
  const metadata = task.metadata;
  const rotation = recordFrom(metadata?.rotation);
  const leveling = recordFrom(metadata?.leveling);
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
    rotationEligible:
      typeof rotation.eligible === 'boolean'
        ? rotation.eligible
        : metadata?.defaultRotationEligible !== false && metadata?.rotationPool !== 'special',
    rotationSlot: normalizeRotationSlot(rotation.slot, task.kind),
    rotationDifficulty: normalizeRotationDifficulty(rotation.difficulty),
    rotationFamily: normalizeRotationFamily(rotation.family, task.kind),
    levelingXp: normalizeLevelingXp(leveling.xp),
  };
}

function preservedMetadataFields(source: Record<string, unknown> | null) {
  const record = source ?? {};
  const omitted = new Set([
    'eventType',
    'event_type',
    'trigger',
    'metric',
    'counter',
    'uniqueBy',
    'unique_by',
    'filters',
    'rotation',
    'leveling',
    'defaultRotationEligible',
    'rotationPool',
  ]);

  return Object.fromEntries(Object.entries(record).filter(([key]) => !omitted.has(key)));
}

function preservedFilters(
  source: Record<string, unknown> | null,
  representedPaths: Set<string>,
): Record<string, unknown>[] {
  const filters = Array.isArray(source?.filters) ? (source.filters as unknown[]) : [];
  return filters.filter(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) && typeof entry.path === 'string' && !representedPaths.has(entry.path),
  );
}

function withRotationAndLeveling(
  metadata: Record<string, unknown>,
  form: TaskFormState,
): Record<string, unknown> {
  const rotationSlot = normalizeRotationSlot(form.rotationSlot, form.kind);
  const rotationDifficulty = normalizeRotationDifficulty(form.rotationDifficulty);
  const rotationEligible =
    form.rotationEligible && rotationSlot !== 'special' && rotationDifficulty !== 'special';

  const next: Record<string, unknown> = {
    ...metadata,
    rotation: {
      eligible: rotationEligible,
      slot: rotationSlot,
      difficulty: rotationDifficulty,
      family: normalizeRotationFamily(form.rotationFamily, form.kind),
    },
    leveling: {
      xp: normalizeLevelingXp(form.levelingXp),
    },
  };

  if (!rotationEligible) {
    next.defaultRotationEligible = false;
  }
  if (rotationSlot === 'special' || rotationDifficulty === 'special') {
    next.rotationPool = 'special';
  }

  return next;
}

function buildMetadata(form: TaskFormState, baseMetadata: Record<string, unknown> | null) {
  const baseFields = preservedMetadataFields(baseMetadata);
  const filters: { path: string; equals?: string; in?: string[] }[] = [];

  if (form.kind === 'leaderboard') {
    return withRotationAndLeveling(
      {
        ...baseFields,
        eventType: 'leaderboard_refreshed',
        metric: 'total',
        filters: [],
      },
      form,
    );
  }

  if (form.kind === 'share') {
    const existingFilters = preservedFilters(baseMetadata, new Set(['payload.context']));
    return withRotationAndLeveling(
      {
        ...baseFields,
        eventType: 'catch_shared',
        metric: 'total',
        filters: [...existingFilters, { path: 'payload.context', equals: 'catch_screen' }],
      },
      form,
    );
  }

  if (form.kind === 'view_bio') {
    const metadata: Record<string, unknown> = {
      ...baseFields,
      eventType: 'fursuit_bio_viewed',
      metric: form.metric,
      filters: [
        ...preservedFilters(baseMetadata, new Set(['payload.owner_id'])),
        { path: 'payload.owner_id', notEqualsUserId: true },
      ],
    };

    if (form.metric === 'unique' && form.uniqueBy.trim()) {
      metadata.uniqueBy = form.uniqueBy.trim();
    }

    return withRotationAndLeveling(metadata, form);
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
    ...baseFields,
    eventType: 'catch_performed',
    metric: form.metric,
    filters: [
      ...preservedFilters(baseMetadata, new Set(['payload.species', 'payload.colors'])),
      ...filters,
    ],
  };

  if (form.metric === 'unique' && form.uniqueBy.trim()) {
    metadata.uniqueBy = form.uniqueBy.trim();
  }

  return withRotationAndLeveling(metadata, form);
}

function summarizeRotation(metadata: Record<string, unknown> | null): string {
  const rotation = recordFrom(metadata?.rotation);
  const slot = typeof rotation.slot === 'string' ? rotation.slot : 'catch';
  const difficulty = typeof rotation.difficulty === 'string' ? rotation.difficulty : 'medium';
  const family = typeof rotation.family === 'string' ? rotation.family : 'general';
  const explicitEligible =
    typeof rotation.eligible === 'boolean'
      ? rotation.eligible
      : metadata?.defaultRotationEligible !== false && metadata?.rotationPool !== 'special';
  const eligible = explicitEligible && slot !== 'special' && difficulty !== 'special';

  return `${eligible ? 'Rotates' : 'No rotation'} · ${slot} · ${difficulty} · ${family}`;
}

function summarizeXp(metadata: Record<string, unknown> | null): string {
  const leveling = recordFrom(metadata?.leveling);
  return `${normalizeLevelingXp(leveling.xp)} XP`;
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
    if (f.path === 'payload.owner_id' && f.notEqualsUserId) parts.push('not own suit');
    if (f.path === 'payload.context' && f.equals) parts.push(`context=${f.equals}`);
    if (f.path === 'payload.has_catcher_owned_maker_match' && f.equals === true)
      parts.push('maker match');
    if (f.path === 'payload.has_maker' && f.equals === true) parts.push('has maker');
    if (f.path === 'payload.is_new_maker_for_catcher_at_convention' && f.equals === true)
      parts.push('new maker');
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
  const [editingMetadata, setEditingMetadata] = useState<Record<string, unknown> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);

  const updateField = <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleKindChange = (kind: string) =>
    setForm((prev) => ({
      ...prev,
      kind,
      rotationSlot: defaultRotationSlotForKind(kind),
      rotationFamily: defaultRotationFamilyForKind(kind),
    }));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    startTransition(async () => {
      try {
        const metadata = buildMetadata(form, null);
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
    setEditingMetadata(task.metadata);
    setForm(formStateFromTask(task));
    setFormError(null);
    setFormSuccess(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingMetadata(null);
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
        const metadata = buildMetadata(form, editingMetadata);
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
        setEditingMetadata(null);
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
      title="Daily Task Catalog"
      subtitle="Active tasks are available to every convention; rotation metadata controls whether they enter normal daily rotation"
    >
      <Table headers={['Name', 'Scope', 'Kind', 'Req.', 'Filters', 'Rotation', 'Status', '']}>
        {tasks.map((task) => (
          <tr key={task.id}>
            <td className="px-4 py-3">
              <p className="font-medium text-slate-200">{task.name}</p>
              {task.description ? <p className="text-xs text-muted">{task.description}</p> : null}
            </td>
            <td className="px-4 py-3">
              <ScopeBadge global={task.convention_id === null} />
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
            <td className="px-4 py-3 text-xs text-slate-400">
              {summarizeRotation(task.metadata)}
              <span className="block text-slate-300">{summarizeXp(task.metadata)}</span>
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
              colSpan={8}
            >
              No daily tasks yet.
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
                onChange={(e) => handleKindChange(e.target.value)}
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
          <div className="grid gap-3 rounded-lg border border-border bg-white/[0.02] p-3 md:grid-cols-4">
            <label className="flex items-center gap-2 text-sm text-slate-200 md:col-span-4">
              <input
                type="checkbox"
                checked={form.rotationEligible}
                onChange={(e) => updateField('rotationEligible', e.target.checked)}
                className="h-4 w-4 rounded border-border bg-background"
              />
              Default rotation eligible
            </label>
            <div>
              <label className="text-xs text-muted">Slot</label>
              <select
                value={form.rotationSlot}
                onChange={(e) => updateField('rotationSlot', e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              >
                {ROTATION_SLOTS.map((slot) => (
                  <option
                    key={slot.value}
                    value={slot.value}
                  >
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">Difficulty</label>
              <select
                value={form.rotationDifficulty}
                onChange={(e) => updateField('rotationDifficulty', e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              >
                {ROTATION_DIFFICULTIES.map((difficulty) => (
                  <option
                    key={difficulty.value}
                    value={difficulty.value}
                  >
                    {difficulty.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">Family</label>
              <input
                value={form.rotationFamily}
                onChange={(e) => updateField('rotationFamily', e.target.value)}
                placeholder="catch_volume"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted">XP</label>
              <input
                type="number"
                min={1}
                max={500}
                value={form.levelingXp}
                onChange={(e) => updateField('levelingXp', Number(e.target.value))}
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
                  ? 'Saving...'
                  : 'Creating...'
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

function ScopeBadge({ global }: { global: boolean }) {
  return (
    <span className="rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-slate-300">
      {global ? 'Global' : 'Legacy scoped'}
    </span>
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
