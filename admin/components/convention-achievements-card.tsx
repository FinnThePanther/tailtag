'use client';

import { useState, useTransition } from 'react';

import {
  createConventionAchievementAction,
  toggleConventionAchievementAction,
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

type Props = {
  conventionId: string;
  achievements: ConventionAchievementRow[];
};

function toAchievementKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function ConventionAchievementsCard({ conventionId, achievements }: Props) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [kind, setKind] = useState<string>(RULE_KINDS[0].value);
  const [threshold, setThreshold] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const selectedKind = RULE_KINDS.find((k) => k.value === kind)!;

  const handleNameChange = (value: string) => {
    setName(value);
    if (!keyTouched) {
      setKey(toAchievementKey(value));
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    startTransition(async () => {
      try {
        await createConventionAchievementAction({
          conventionId,
          key,
          name,
          description,
          category,
          kind,
          threshold: selectedKind.hasThreshold ? threshold : null,
        });
        setName('');
        setKey('');
        setKeyTouched(false);
        setDescription('');
        setCategory(CATEGORIES[0].value);
        setKind(RULE_KINDS[0].value);
        setThreshold(1);
        setFormSuccess('Achievement created.');
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to create achievement.');
      }
    });
  };

  const handleToggle = (achievementId: string, isActive: boolean) => {
    setTogglingId(achievementId);
    startTransition(async () => {
      try {
        await toggleConventionAchievementAction({ achievementId, isActive, conventionId });
      } finally {
        setTogglingId(null);
      }
    });
  };

  return (
    <Card
      title="Convention Achievements"
      subtitle="Achievements visible only to players opted into this convention"
    >
      <Table headers={['Name / Key', 'Category', 'Rule', 'Status', '']}>
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
            <td className="px-4 py-3">
              <StatusBadge active={ach.is_active} />
            </td>
            <td className="px-4 py-3 text-right">
              <button
                type="button"
                disabled={isPending && togglingId === ach.id}
                onClick={() => handleToggle(ach.id, !ach.is_active)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
              >
                {ach.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </td>
          </tr>
        ))}
        {achievements.length === 0 ? (
          <tr>
            <td className="px-4 py-3 text-sm text-muted" colSpan={5}>
              No convention achievements yet.
            </td>
          </tr>
        ) : null}
      </Table>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="mb-4 text-sm font-semibold text-white">Add an achievement</h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted">Name</label>
              <input
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Welcome to the Con"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Key (auto-filled, editable)</label>
              <input
                required
                value={key}
                onChange={(e) => {
                  setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
                  setKeyTouched(true);
                }}
                placeholder="WELCOME_TO_THE_CON"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown to players on the achievement card"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
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
                value={kind}
                onChange={(e) => setKind(e.target.value)}
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
            <div className="md:w-1/2">
              <label className="text-xs text-muted">Threshold (unique catchers)</label>
              <input
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending || !name.trim() || !key.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create achievement'}
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
