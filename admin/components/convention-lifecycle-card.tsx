'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CalendarClock, CheckCircle2, Loader2, Play, RefreshCcw, Wand2 } from 'lucide-react';

import {
  generateConventionGameplayPackAction,
  rotateConventionDailiesAction,
  runConventionReadinessCheckAction,
  startConventionAction,
} from '@/app/(dashboard)/conventions/actions';
import { Card } from '@/components/card';
import type { ConventionReadinessResult } from '@/lib/convention-lifecycle';

type Props = {
  conventionId: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  readiness: ConventionReadinessResult;
};

export function ConventionLifecycleCard({
  conventionId,
  status,
  startDate,
  endDate,
  timezone,
  readiness,
}: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runAction = (actionName: string, callback: () => Promise<string>) => {
    setAction(actionName);
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const nextMessage = await callback();
        setMessage(nextMessage);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setAction(null);
      }
    });
  };

  const lifecycleCopy = getLifecycleCopy(status, readiness);
  const startDisabled =
    isPending ||
    status === 'live' ||
    !readiness.ready ||
    (readiness.dateState !== 'before_window' && readiness.dateState !== 'inside_window');
  const rotateDisabled = isPending || status !== 'live' || readiness.dateState !== 'inside_window';
  const startLabel =
    readiness.dateState === 'before_window' ? 'Schedule convention' : 'Start convention';

  return (
    <Card
      title="Lifecycle"
      subtitle={lifecycleCopy}
      actions={<StatusBadge status={status} />}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Info
          icon={<CalendarClock size={14} />}
          label="Date window"
        >
          {startDate && endDate ? `${startDate} to ${endDate}` : 'Dates required'}
        </Info>
        <Info
          icon={<CalendarClock size={14} />}
          label="Local day"
        >
          {readiness.localDay} ({timezone || 'UTC'})
        </Info>
        <Info
          icon={<CheckCircle2 size={14} />}
          label="Readiness"
        >
          {readiness.ready ? 'Ready' : `${readiness.blockingIssues.length} blocker(s)`}
        </Info>
        <Info
          icon={<RefreshCcw size={14} />}
          label="Today's rotation"
        >
          {readiness.counts.todayAssignments > 0
            ? `${readiness.counts.todayAssignments} assigned`
            : 'Not rotated'}
        </Info>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Info label="Active rotation tasks">{readiness.counts.activeRotationTasks}</Info>
        <Info label="Convention tasks">{readiness.counts.conventionTasks}</Info>
        <Info label="Convention achievements">{readiness.counts.conventionAchievements}</Info>
      </div>

      {readiness.blockingIssues.length > 0 ? (
        <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3">
          <p className="text-sm font-semibold text-red-200">Startup blockers</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-100">
            {readiness.blockingIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {readiness.warnings.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3">
          <p className="text-sm font-semibold text-amber-100">Warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50">
            {readiness.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton
          disabled={isPending}
          loading={action === 'generate'}
          icon={<Wand2 size={14} />}
          onClick={() =>
            runAction('generate', async () => {
              const result = await generateConventionGameplayPackAction(conventionId);
              return `Gameplay pack ready: ${result.tasks.created} task(s) and ${result.achievements.created} achievement(s) created.`;
            })
          }
        >
          Generate gameplay pack
        </ActionButton>
        <ActionButton
          disabled={isPending}
          loading={action === 'readiness'}
          icon={<CheckCircle2 size={14} />}
          onClick={() =>
            runAction('readiness', async () => {
              const result = await runConventionReadinessCheckAction(conventionId);
              return result.ready
                ? 'Readiness check passed.'
                : `Readiness check found ${result.blockingIssues.length} blocker(s).`;
            })
          }
        >
          Run readiness check
        </ActionButton>
        <ActionButton
          disabled={startDisabled}
          loading={action === 'start'}
          icon={<Play size={14} />}
          onClick={() =>
            runAction('start', async () => {
              const result = await startConventionAction(conventionId);
              return result.status === 'live'
                ? 'Convention started and daily tasks were ensured.'
                : 'Convention scheduled. It still needs a manual start when the event begins.';
            })
          }
        >
          {startLabel}
        </ActionButton>
        <ActionButton
          disabled={rotateDisabled}
          loading={action === 'rotate'}
          icon={<RefreshCcw size={14} />}
          onClick={() =>
            runAction('rotate', async () => {
              const result = await rotateConventionDailiesAction(conventionId);
              const firstResult = Array.isArray(result?.results) ? result.results[0] : null;
              if (firstResult?.skipped) return `Rotation skipped: ${firstResult.reason}.`;
              if (firstResult?.refreshed === false) return 'Daily tasks were already rotated.';
              return 'Daily tasks rotated.';
            })
          }
        >
          Rotate today&apos;s tasks
        </ActionButton>
      </div>

      {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {rotateDisabled && status !== 'live' ? (
        <p className="mt-3 text-xs text-muted">
          Daily rotation is available after the convention is live.
        </p>
      ) : null}
    </Card>
  );
}

function Info({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-slate-200">
      {icon ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-primary">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <p className="font-semibold text-white">{children}</p>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  loading,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  loading: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <Loader2
          className="animate-spin"
          size={14}
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === 'live'
      ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200'
      : status === 'scheduled'
        ? 'border-sky-300/40 bg-sky-400/10 text-sky-200'
        : status === 'draft'
          ? 'border-slate-300/30 bg-white/5 text-slate-200'
          : 'border-amber-300/40 bg-amber-400/10 text-amber-100';

  return (
    <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${className}`}>
      {status}
    </span>
  );
}

function getLifecycleCopy(status: string, readiness: ConventionReadinessResult) {
  if (status === 'scheduled' && readiness.dateState === 'inside_window') {
    return 'Ready to start manually';
  }
  if (status === 'live')
    return 'Players can join while the convention remains inside its date window';
  if (readiness.dateState === 'before_window') return 'Ready future conventions can be scheduled';
  if (readiness.dateState === 'inside_window') return 'Start the convention when staff are ready';
  if (readiness.dateState === 'after_window')
    return 'This convention is past its local date window';
  return 'Complete required setup before startup';
}
