'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Circle } from 'lucide-react';

import { Card } from '@/components/card';

const STORAGE_KEY = 'admin_pre_event_checklist_v1';

type Item = { id: string; label: string; description: string };

const DEFAULT_ITEMS: Item[] = [
  {
    id: 'config',
    label: 'Review convention config',
    description: 'Verify cooldowns, points, feature flags, and Staff Mode toggle.',
  },
  {
    id: 'staff',
    label: 'Confirm staff assignments',
    description: 'Ensure organizers/staff are assigned to the correct convention.',
  },
  {
    id: 'tags',
    label: 'Check tag inventory',
    description: 'Register tags and link samples; verify duplicate detection.',
  },
  {
    id: 'catch',
    label: 'Run test catches',
    description: 'Simulate/perform catches to confirm pipelines and analytics.',
  },
  {
    id: 'alerts',
    label: 'Set alerts',
    description: 'Verify error logging and webhook/notifications if configured.',
  },
];

export default function ChecklistPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setChecked(JSON.parse(saved));
      } catch {
        setChecked({});
      }
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
  }, [checked]);

  const toggle = (id: string) =>
    setChecked((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));

  const reset = () => setChecked({});

  return (
    <Card
      title="Pre-event checklist"
      subtitle="Quick reminders to prep conventions; stored locally in this browser."
      actions={
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
        >
          Reset
        </button>
      }
    >
      <div className="space-y-3">
        {DEFAULT_ITEMS.map((item) => {
          const isDone = checked[item.id] ?? false;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-background/60 px-3 py-2 text-left transition hover:border-primary"
            >
              {isDone ? (
                <CheckCircle size={18} className="mt-0.5 text-primary" />
              ) : (
                <Circle size={18} className="mt-0.5 text-muted" />
              )}
              <div>
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="text-xs text-muted">{item.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
