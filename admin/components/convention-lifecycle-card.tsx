'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCcw,
  Trash2,
  Wand2,
} from 'lucide-react';

import {
  closeConventionAction,
  deleteArchivedConventionInDevAction,
  generateConventionGameplayPackAction,
  regenerateConventionRecapsAction,
  rotateConventionDailiesAction,
  retryConventionCloseoutAction,
  runConventionReadinessCheckAction,
  startConventionAction,
} from '@/app/(dashboard)/conventions/actions';
import { Card } from '@/components/card';
import { formatRecommendedAction, StatusBadge } from '@/components/convention-lifecycle-ui';
import type {
  ConventionLifecycleHealthResult,
  ConventionReadinessResult,
} from '@/lib/convention-lifecycle';

type Props = {
  conventionId: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  closedAt: string | null;
  archivedAt: string | null;
  closeoutError: string | null;
  closeoutSummary: Record<string, unknown> | null;
  readiness: ConventionReadinessResult;
  health: ConventionLifecycleHealthResult;
  showDevDelete: boolean;
};

export function ConventionLifecycleCard({
  conventionId,
  status,
  startDate,
  endDate,
  timezone,
  closedAt,
  archivedAt,
  closeoutError,
  closeoutSummary,
  readiness,
  health,
  showDevDelete,
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
    status === 'scheduled' && readiness.dateState === 'inside_window'
      ? 'Start manually'
      : readiness.dateState === 'before_window'
        ? 'Schedule convention'
        : 'Start convention';
  const closeDisabled = isPending || status !== 'live';
  const retryCloseoutDisabled = isPending || status !== 'closed';
  const regenerateDisabled = isPending || status !== 'archived';
  const devDeleteDisabled = isPending || status !== 'archived';
  const recapsGenerated = getNumber(closeoutSummary, 'recaps_generated');
  const expiredPendingCatches = getNumber(closeoutSummary, 'pending_catches_expired');
  const membershipsRemoved = getNumber(closeoutSummary, 'profile_memberships_removed');
  const rosterRemoved = getNumber(closeoutSummary, 'fursuit_assignments_removed');
  const healthBadge = getHealthBadge(health.severity);

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

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Info label="Closed at">{closedAt ? formatDateTime(closedAt) : 'Not closed'}</Info>
        <Info label="Archived at">{archivedAt ? formatDateTime(archivedAt) : 'Not archived'}</Info>
        <Info label="Recaps">{recapsGenerated === null ? 'Not generated' : recapsGenerated}</Info>
        <Info label="Expired pending catches">
          {expiredPendingCatches === null ? 'Not run' : expiredPendingCatches}
        </Info>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Info label="Accepted catches">{health.diagnostics.acceptedConventionCatches}</Info>
        <Info label="Pending catches">{health.diagnostics.pendingConventionCatches}</Info>
        <Info label="Active memberships">{health.diagnostics.activeProfileMemberships}</Info>
        <Info label="Fursuit roster">{health.diagnostics.activeFursuitAssignments}</Info>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Info label="Health">
          <span className={healthBadge.className}>{healthBadge.label}</span>
        </Info>
        <Info label="Recommended action">{formatRecommendedAction(health.recommendedAction)}</Info>
        <Info label="Participant recap rows">{health.diagnostics.participantRecaps}</Info>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Info label="Last automation attempt">
          {health.diagnostics.lastAutomationAttemptAt
            ? formatDateTime(health.diagnostics.lastAutomationAttemptAt)
            : 'None'}
        </Info>
        <Info label="Automation source">
          {formatAutomationSource(health.diagnostics.lastAutomationSource)}
        </Info>
        <Info label="Retry attempts, 7 days">
          {health.diagnostics.automationRetryAttemptsLast7Days}
        </Info>
        <Info label="Automation eligibility">
          {formatAutomationEligibility(health.diagnostics)}
        </Info>
      </div>

      {status === 'archived' ? (
        <div className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-3">
          <p className="text-sm font-semibold text-emerald-100">Archive complete</p>
          <p className="mt-1 text-sm text-emerald-50">
            {recapsGenerated ?? 0} participant recap(s), {membershipsRemoved ?? 0} active
            membership(s), and {rosterRemoved ?? 0} fursuit roster assignment(s) were processed.
          </p>
        </div>
      ) : null}

      {closeoutError ? (
        <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-200">
            <AlertTriangle size={14} />
            Closeout failed
          </p>
          <p className="mt-2 text-sm text-red-100">{closeoutError}</p>
        </div>
      ) : null}

      {health.warnings.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3">
          <p className="text-sm font-semibold text-amber-100">Lifecycle health</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50">
            {health.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

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
        <ActionButton
          disabled={closeDisabled}
          loading={action === 'close'}
          icon={<Archive size={14} />}
          onClick={() => {
            const confirmed = window.confirm(
              [
                'Close and archive this convention?',
                '',
                'Players will no longer be able to join or play in this convention.',
                'Pending catches will expire.',
                'Active player memberships and fursuit roster entries will be removed.',
                'Catches, achievements, and recap data will be preserved.',
                '',
                'This is not a hard delete.',
              ].join('\n'),
            );
            if (!confirmed) return;
            runAction('close', async () => {
              const result = await closeConventionAction(conventionId);
              return result.already_archived
                ? 'Convention was already archived.'
                : `Convention archived with ${result.recaps_generated} recap(s).`;
            });
          }}
        >
          Close and archive convention
        </ActionButton>
        <ActionButton
          disabled={retryCloseoutDisabled}
          loading={action === 'retry-closeout'}
          icon={<RefreshCcw size={14} />}
          onClick={() =>
            runAction('retry-closeout', async () => {
              const result = await retryConventionCloseoutAction(conventionId);
              return result.already_archived
                ? 'Convention was already archived.'
                : `Closeout retried and archived with ${result.recaps_generated} recap(s).`;
            })
          }
        >
          Retry closeout
        </ActionButton>
        <ActionButton
          disabled={regenerateDisabled}
          loading={action === 'regenerate'}
          icon={<RefreshCcw size={14} />}
          onClick={() =>
            runAction('regenerate', async () => {
              const result = await regenerateConventionRecapsAction(conventionId);
              return `Recaps regenerated with ${result.recaps_generated} participant recap(s).`;
            })
          }
        >
          Regenerate recaps
        </ActionButton>
        {showDevDelete ? (
          <ActionButton
            disabled={devDeleteDisabled}
            loading={action === 'dev-delete'}
            icon={<Trash2 size={14} />}
            variant="danger"
            onClick={() => {
              const confirmed = window.confirm(
                [
                  'Delete this archived convention from the dev database?',
                  '',
                  'This removes convention-scoped tasks, achievements, recaps, daily progress, active rows, and other test data tied to this convention.',
                  'Catches, events, reports, and admin errors may remain but lose this convention link.',
                  '',
                  'This is for dev cleanup only and cannot be undone.',
                ].join('\n'),
              );
              if (!confirmed) return;
              runAction('dev-delete', async () => {
                await deleteArchivedConventionInDevAction(conventionId);
                router.push('/conventions');
                return 'Archived convention deleted from dev.';
              });
            }}
          >
            Delete from dev
          </ActionButton>
        ) : null}
      </div>

      {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {rotateDisabled && status !== 'live' ? (
        <p className="mt-3 text-xs text-muted">
          Daily rotation is available after the convention is live.
        </p>
      ) : null}
      {closeDisabled && status !== 'live' ? (
        <p className="mt-2 text-xs text-muted">
          Closeout is available only for live conventions. Closed conventions can be retried.
        </p>
      ) : null}
      {regenerateDisabled && status !== 'archived' ? (
        <p className="mt-2 text-xs text-muted">
          Recap regeneration is available after the convention is archived.
        </p>
      ) : null}
      {showDevDelete ? (
        <p className="mt-2 text-xs text-muted">
          Dev delete is available only for archived conventions and removes test data permanently.
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
  variant = 'default',
}: {
  children: React.ReactNode;
  disabled: boolean;
  loading: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
}) {
  const className =
    variant === 'danger'
      ? 'inline-flex items-center gap-2 rounded-lg border border-red-400/50 px-3 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-50'
      : 'inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
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

function getLifecycleCopy(status: string, readiness: ConventionReadinessResult) {
  if (status === 'archived') return 'Closeout is complete and recaps are available to players';
  if (status === 'closed') return 'Gameplay is stopped; retry closeout to finish archiving';
  if (status === 'canceled') return 'This convention was canceled and is not playable';
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function getNumber(summary: Record<string, unknown> | null, key: string) {
  const value = summary?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatAutomationSource(source: string | null) {
  if (source === 'cron_close') return 'Auto-close';
  if (source === 'cron_retry') return 'Auto-retry';
  return 'None';
}

function formatAutomationEligibility(health: ConventionLifecycleHealthResult['diagnostics']) {
  if (health.automationEligibleForAutoClose) return 'Auto-close eligible';
  if (health.automationEligibleForRetry) return 'Auto-retry eligible';
  return 'Not eligible';
}

function getHealthBadge(severity: string) {
  if (severity === 'critical') {
    return {
      label: 'Critical',
      className: 'text-red-200',
    };
  }
  if (severity === 'warning') {
    return {
      label: 'Warning',
      className: 'text-amber-100',
    };
  }
  if (severity === 'info') {
    return {
      label: 'Info',
      className: 'text-sky-200',
    };
  }
  return {
    label: 'Healthy',
    className: 'text-emerald-200',
  };
}
