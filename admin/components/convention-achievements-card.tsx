'use client';

import { useState, useTransition } from 'react';

import {
  createConventionAchievementAction,
  deleteConventionAchievementAction,
  toggleConventionAchievementAction,
  updateConventionAchievementAction,
} from '@/app/(dashboard)/conventions/actions';
import { Card } from '@/components/card';
import { Table } from '@/components/table';
import type { ConventionAchievementRow } from '@/lib/data';

const CATEGORIES = [
  { value: 'catching', label: 'Catching' },
  { value: 'variety', label: 'Variety' },
  { value: 'dedication', label: 'Dedication' },
  { value: 'fursuiter', label: 'Fursuiter' },
  { value: 'fun', label: 'Fun' },
  { value: 'meta', label: 'Meta' },
] as const;

const RULE_KINDS = [
  {
    value: 'fursuit_caught_count_at_convention',
    label: 'Fursuit caught count (at convention)',
    hasThreshold: true,
  },
  {
    value: 'convention_joined',
    label: 'Convention joined',
    hasThreshold: false,
  },
] as const;

const METRIC_OPTIONS = [
  { value: 'total', label: 'Total count' },
  { value: 'unique', label: 'Unique (deduplicated)' },
] as const;

type AchievementFormState = {
  name: string;
  key: string;
  keyTouched: boolean;
  description: string;
  category: string;
  kind: string;
  threshold: number;
  metric: string;
  uniqueBy: string;
  speciesFilter: string;
  colorFilter: string;
};

function defaultFormState(): AchievementFormState {
  return {
    name: '',
    key: '',
    keyTouched: false,
    description: '',
    category: CATEGORIES[0].value,
    kind: RULE_KINDS[0].value,
    threshold: 1,
    metric: 'total',
    uniqueBy: 'payload.fursuit_id',
    speciesFilter: '',
    colorFilter: '',
  };
}

function formStateFromAchievement(ach: ConventionAchievementRow): AchievementFormState {
  const rule = ach.rule as Record<string, unknown> | null;
  const threshold =
    ach.rule_kind === 'fursuit_caught_count_at_convention' && rule
      ? (rule.threshold as number) ?? 1
      : 1;

  const filters = Array.isArray(rule?.filters) ? (rule.filters as Record<string, unknown>[]) : [];
  const speciesEntry = filters.find((f) => f.path === 'payload.species');
  const colorEntry = filters.find((f) => f.path === 'payload.colors');

  return {
    name: ach.name,
    key: ach.key,
    keyTouched: true,
    description: ach.description ?? '',
    category: ach.category,
    kind: ach.rule_kind ?? RULE_KINDS[0].value,
    threshold,
    metric: typeof rule?.metric === 'string' ? rule.metric : 'total',
    uniqueBy: typeof rule?.uniqueBy === 'string' ? rule.uniqueBy : 'payload.fursuit_id',
    speciesFilter: typeof speciesEntry?.equals === 'string' ? speciesEntry.equals : '',
    colorFilter: Array.isArray(colorEntry?.in) ? (colorEntry.in as string[]).join(', ') : '',
  };
}

function buildRule(form: AchievementFormState, kind: string) {
  if (kind === 'convention_joined') return {};

  const filters: { path: string; equals?: string; in?: string[] }[] = [];

  if (form.speciesFilter.trim()) {
    filters.push({ path: 'payload.species', equals: form.speciesFilter.trim() });
  }

  if (form.colorFilter.trim()) {
    const colors = form.colorFilter.split(',').map((c) => c.trim()).filter(Boolean);
    if (colors.length > 0) {
      filters.push({ path: 'payload.colors', in: colors });
    }
  }

  const rule: Record<string, unknown> = {
    threshold: form.threshold,
    metric: form.metric,
    filters,
  };

  if (form.metric === 'unique' && form.uniqueBy.trim()) {
    rule.uniqueBy = form.uniqueBy.trim();
  }

  return rule;
}

function summarizeRule(rule: Record<string, unknown> | null, kind: string | null): string | null {
  if (!rule || kind !== 'fursuit_caught_count_at_convention') return null;
  const parts: string[] = [];
  if (rule.metric === 'unique') parts.push('unique');
  const filters = Array.isArray(rule.filters) ? (rule.filters as Record<string, unknown>[]) : [];
  for (const f of filters) {
    if (f.path === 'payload.species' && f.equals) parts.push(`species=${f.equals}`);
    if (f.path === 'payload.colors' && Array.isArray(f.in)) parts.push(`colors=${(f.in as string[]).join(',')}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function toAchievementKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

type Props = {
  conventionId: string;
  achievements: ConventionAchievementRow[];
};

export function ConventionAchievementsCard({ conventionId, achievements }: Props) {
  const [form, setForm] = useState<AchievementFormState>(defaultFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);

  const selectedKind = RULE_KINDS.find((k) => k.value === form.kind)!;

  const updateField = <K extends keyof AchievementFormState>(key: K, value: AchievementFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleNameChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      name: value,
      key: prev.keyTouched ? prev.key : toAchievementKey(value),
    }));
  };

  const handleKeyChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      key: value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
      keyTouched: true,
    }));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    startTransition(async () => {
      try {
        await createConventionAchievementAction({
          conventionId,
          key: form.key,
          name: form.name,
          description: form.description,
          category: form.category,
          kind: form.kind,
          rule: buildRule(form, form.kind),
        });
        setForm(defaultFormState());
        setFormSuccess('Achievement created.');
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to create achievement.');
      }
    });
  };

  const handleStartEdit = (ach: ConventionAchievementRow) => {
    setEditingId(ach.id);
    setEditingRuleId(ach.rule_id);
    setForm(formStateFromAchievement(ach));
    setFormError(null);
    setFormSuccess(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingRuleId(null);
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
        await updateConventionAchievementAction({
          achievementId: editingId,
          conventionId,
          name: form.name,
          description: form.description,
          category: form.category,
          kind: form.kind,
          rule: buildRule(form, form.kind),
          ruleId: editingRuleId,
        });
        setEditingId(null);
        setEditingRuleId(null);
        setForm(defaultFormState());
        setFormSuccess('Achievement updated.');
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to update achievement.');
      }
    });
  };

  const handleToggle = (achievementId: string, isActive: boolean) => {
    setActionId(achievementId);
    startTransition(async () => {
      try {
        await toggleConventionAchievementAction({ achievementId, isActive, conventionId });
      } finally {
        setActionId(null);
      }
    });
  };

  const handleDelete = (ach: ConventionAchievementRow) => {
    if (!confirm(`Delete "${ach.name}"? This cannot be undone.`)) return;
    setActionId(ach.id);
    startTransition(async () => {
      try {
        await deleteConventionAchievementAction({
          achievementId: ach.id,
          conventionId,
          ruleId: ach.rule_id,
        });
      } finally {
        setActionId(null);
      }
    });
  };

  const isEditing = editingId !== null;

  return (
    <Card
      title="Convention Achievements"
      subtitle="Achievements visible only to players opted into this convention"
    >
      <Table headers={['Name / Key', 'Category', 'Rule', 'Filters', 'Status', '']}>
        {achievements.map((ach) => (
          <tr key={ach.id}>
            <td className="px-4 py-3">
              <p className="font-medium text-slate-200">{ach.name}</p>
              <p className="font-mono text-xs text-muted">{ach.key}</p>
            </td>
            <td className="px-4 py-3">
              <span className="rounded-md bg-white/5 px-2 py-1 text-xs font-medium capitalize text-slate-300">
                {ach.category}
              </span>
            </td>
            <td className="px-4 py-3">
              <p className="text-xs text-slate-300">{ach.rule_kind ?? '—'}</p>
              {ach.rule && ach.rule_kind === 'fursuit_caught_count_at_convention' ? (
                <p className="text-xs text-muted">
                  threshold: {(ach.rule as { threshold?: number }).threshold ?? '?'}
                </p>
              ) : null}
            </td>
            <td className="px-4 py-3 text-xs text-slate-400">
              {summarizeRule(ach.rule, ach.rule_kind) ?? <span className="text-muted">none</span>}
            </td>
            <td className="px-4 py-3">
              <StatusBadge active={ach.is_active} />
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleStartEdit(ach)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={isPending && actionId === ach.id}
                  onClick={() => handleToggle(ach.id, !ach.is_active)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
                >
                  {ach.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  disabled={isPending && actionId === ach.id}
                  onClick={() => handleDelete(ach)}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:border-red-500 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        ))}
        {achievements.length === 0 ? (
          <tr>
            <td className="px-4 py-3 text-sm text-muted" colSpan={6}>
              No convention achievements yet.
            </td>
          </tr>
        ) : null}
      </Table>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="mb-4 text-sm font-semibold text-white">
          {isEditing ? 'Edit achievement' : 'Add an achievement'}
        </h3>
        <form onSubmit={isEditing ? handleUpdate : handleCreate} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Welcome to the Con"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted">
                Key {isEditing ? '(read-only)' : '(auto-filled, editable)'}
              </label>
              <input
                required
                value={form.key}
                onChange={(e) => handleKeyChange(e.target.value)}
                disabled={isEditing}
                placeholder="WELCOME_TO_THE_CON"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-primary disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted">Description</label>
            <input
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Shown to players on the achievement card"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted">Category</label>
              <select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">Rule kind</label>
              <select
                value={form.kind}
                onChange={(e) => updateField('kind', e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              >
                {RULE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedKind.hasThreshold ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-muted">Threshold</label>
                  <input
                    type="number"
                    min={1}
                    value={form.threshold}
                    onChange={(e) => updateField('threshold', Number(e.target.value))}
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
                      <option key={m.value} value={m.value}>
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
            </>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending || !form.name.trim() || !form.key.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
            >
              {isPending
                ? isEditing ? 'Saving…' : 'Creating…'
                : isEditing ? 'Save changes' : 'Create achievement'}
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
