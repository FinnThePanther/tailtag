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
  Wrench,
} from 'lucide-react';

import {
  closeConventionAction,
  deleteArchivedConventionInDevAction,
  generateConventionGameplayPackAction,
  regenerateConventionRecapsAction,
  rotateConventionDailiesAction,
  retryConventionCloseoutAction,
  runConventionReadinessCheckAction,
  silentRepairHistoricalConventionAction,
  startConventionAction,
} from '@/app/(dashboard)/conventions/actions';
import { Card } from '@/components/card';
import { formatRecommendedAction, StatusBadge } from '@/components/convention-lifecycle-ui';
import type {
  ConventionCloseoutResult,
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
  showSilentRepair: boolean;
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
  showSilentRepair,
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
        router.refresh();
      } finally {
        setAction(null);
      }
    });
  };

  const lifecycleCopy = getLifecycleCopy(status, readiness);
  const dateAllowsStartAction =
    readiness.dateState === 'before_window' || readiness.dateState === 'inside_window';
  const scheduledForFuture = status === 'scheduled' && readiness.dateState === 'before_window';
  const hasStartupBlockers = readiness.blockingIssues.some(
    (issue) => issue !== 'The local convention date window has already ended.',
  );
  const startDisabled =
    isPending ||
    status === 'live' ||
    scheduledForFuture ||
    !dateAllowsStartAction ||
    hasStartupBlockers;
  const rotateDisabled = isPending || status !== 'live' || readiness.dateState !== 'inside_window';
  const startLabel =
    status === 'scheduled' && readiness.dateState === 'inside_window'
      ? 'Start manually'
      : status === 'scheduled' && readiness.dateState === 'before_window'
        ? 'Scheduled'
        : readiness.dateState === 'before_window'
          ? 'Schedule convention'
          : 'Start convention';
  const closeoutDueForAdminClose =
    status === 'finalizing' && health.diagnostics.automationEligibleForAutoClose;
  const legacyFailedClosedConvention =
    status === 'closed' && (Boolean(closeoutError) || archivedAt === null);
  const closeDisabled = isPending || !closeoutDueForAdminClose;
  const retryCloseoutDisabled =
    isPending || (status !== 'closeout_failed' && !legacyFailedClosedConvention);
  const regenerateDisabled = isPending || status !== 'archived';
  const devDeleteDisabled = isPending || status !== 'archived';
  const recapsGenerated = getNumber(closeoutSummary, 'recaps_generated');
  const silentRepairApplied = closeoutSummary?.silent_repair === true;
  const silentRepairDisabled =
    isPending ||
    silentRepairApplied ||
    !(
      status === 'closed' ||
      status === 'closeout_failed' ||
      (status === 'archived' && (Boolean(closeoutError) || recapsGenerated === 0))
    );
  const expiredPendingCatches = getNumber(closeoutSummary, 'pending_catches_expired');
  const membershipsFinalized =
    getNumber(closeoutSummary, 'profile_memberships_finalized') ??
    getNumber(closeoutSummary, 'profile_memberships_removed');
  const rosterFinalized =
    getNumber(closeoutSummary, 'fursuit_assignments_finalized') ??
    getNumber(closeoutSummary, 'fursuit_assignments_removed');
  const lastCloseoutAttemptAt =
    health.diagnostics.closeoutLastAttemptAt ?? health.diagnostics.lastAutomationAttemptAt;
  const healthBadge = getHealthBadge(health.severity);
  const showStartupReadiness = status === 'draft' || status === 'scheduled';
  const readinessLabel = showStartupReadiness
    ? readiness.ready
      ? 'Ready'
      : `${readiness.blockingIssues.length} blocker(s)`
    : 'Not applicable';

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
          {readinessLabel}
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
        <Info label="Finalizing started">
          {health.diagnostics.finalizingStartedAt
            ? formatDateTime(health.diagnostics.finalizingStartedAt)
            : 'Not started'}
        </Info>
        <Info label="Finalizing deadline">
          {health.diagnostics.closeoutNotBefore
            ? formatDateTime(health.diagnostics.closeoutNotBefore)
            : 'Not set'}
        </Info>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Info label="Closeout started">
          {health.diagnostics.closeoutStartedAt
            ? formatDateTime(health.diagnostics.closeoutStartedAt)
            : 'Not started'}
        </Info>
        <Info label="Closeout completed">
          {health.diagnostics.closeoutCompletedAt
            ? formatDateTime(health.diagnostics.closeoutCompletedAt)
            : 'Not completed'}
        </Info>
        <Info label="Last closeout attempt">
          {lastCloseoutAttemptAt ? formatDateTime(lastCloseoutAttemptAt) : 'None'}
        </Info>
        <Info label="Closeout step">{formatCloseoutStep(health.diagnostics.closeoutStep)}</Info>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Info label="Recaps">{recapsGenerated === null ? 'Not generated' : recapsGenerated}</Info>
        <Info label="Expired pending catches">
          {expiredPendingCatches === null ? 'Not run' : expiredPendingCatches}
        </Info>
        <Info label="Retry count">{health.diagnostics.closeoutRetryCount}</Info>
        <Info label="Retry mode">{formatAutomationEligibility(health.diagnostics)}</Info>
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
        <Info label="Closeout source">
          {formatAutomationSource(health.diagnostics.lastAutomationSource)}
        </Info>
        <Info label="Retry attempts, 7 days">
          {health.diagnostics.automationRetryAttemptsLast7Days}
        </Info>
      </div>

      {status === 'archived' ? (
        <div className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-3">
          <p className="text-sm font-semibold text-emerald-100">Archive complete</p>
          <p className="mt-1 text-sm text-emerald-50">
            {recapsGenerated ?? 0} participant recap(s), {membershipsFinalized ?? 0} active
            membership(s), and {rosterFinalized ?? 0} fursuit roster assignment(s) were finalized.
          </p>
        </div>
      ) : null}

      {silentRepairApplied ? (
        <div className="mt-4 rounded-lg border border-sky-300/30 bg-sky-400/10 p-3">
          <p className="text-sm font-semibold text-sky-100">Silent historical repair applied</p>
          <p className="mt-1 text-sm text-sky-50">
            Stale closeout state was archived without generating recaps or notifying players.
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

      {showStartupReadiness && readiness.blockingIssues.length > 0 ? (
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
                'Active player memberships and fursuit roster entries will be finalized.',
                'Catches, achievements, and recap data will be preserved.',
                '',
                'This is not a hard delete.',
              ].join('\n'),
            );
            if (!confirmed) return;
            runAction('close', async () => {
              const result = await closeConventionAction(conventionId);
              return formatCloseoutActionResult(result, 'close');
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
              return formatCloseoutActionResult(result, 'retry');
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
              return formatCloseoutActionResult(result, 'regenerate');
            })
          }
        >
          Regenerate recaps
        </ActionButton>
        {showSilentRepair ? (
          <ActionButton
            disabled={silentRepairDisabled}
            loading={action === 'silent-repair'}
            icon={<Wrench size={14} />}
            onClick={() => {
              const confirmed = window.confirm(
                [
                  'Silently repair this historical convention?',
                  '',
                  'This is only for historical conventions that failed before the lifecycle shipped.',
                  'It archives stale closeout failure state for development/staging validation.',
                  'It does not generate recaps.',
                  'It does not create player notifications.',
                  '',
                  'Use this only for historical broken conventions.',
                ].join('\n'),
              );
              if (!confirmed) return;
              runAction('silent-repair', async () => {
                const result = await silentRepairHistoricalConventionAction(conventionId);
                return result.repaired
                  ? 'Historical convention silently repaired.'
                  : 'Silent repair did not change this convention.';
              });
            }}
          >
            Silent repair
          </ActionButton>
        ) : null}
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
      {closeDisabled && !isPending ? (
        <p className="mt-2 text-xs text-muted">
          Closeout is available after the convention enters finalizing and reaches the finalizing
          deadline. Failed closeouts can be retried.
        </p>
      ) : null}
      {regenerateDisabled && status !== 'archived' ? (
        <p className="mt-2 text-xs text-muted">
          Recap regeneration is available after the convention is archived.
        </p>
      ) : null}
      {showSilentRepair || showDevDelete ? (
        <p className="mt-2 text-xs text-muted">
          {showSilentRepair
            ? 'Silent repair is for broken historical dev/staging conventions and does not create recaps or notifications.'
            : null}
          {showDevDelete
            ? ' Dev delete is available only for archived conventions and removes test data permanently.'
            : null}
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
  if (status === 'finalizing') return 'Convention is in the player cleanup window before closeout';
  if (status === 'closeout_running') return 'Closeout is processing and recaps are being prepared';
  if (status === 'closeout_failed') return 'Closeout needs operator attention before archiving';
  if (status === 'closed') return 'Gameplay is stopped; retry closeout to finish archiving';
  if (status === 'canceled') return 'This convention was canceled and is not playable';
  if (status === 'scheduled' && readiness.dateState === 'inside_window') {
    return 'Ready to start manually';
  }
  if (status === 'scheduled' && readiness.dateState === 'before_window') {
    return 'Scheduled for a future local date';
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

function formatCloseoutActionResult(
  result: ConventionCloseoutResult,
  mode: 'close' | 'retry' | 'regenerate',
) {
  if (result.already_running) return 'Closeout is already running.';
  if (result.not_due) return 'Closeout is not due yet.';
  if (result.already_archived && mode !== 'regenerate') return 'Convention was already archived.';
  if (mode === 'regenerate') {
    return `Recaps regenerated with ${result.recaps_generated} participant recap(s).`;
  }
  if (mode === 'retry') {
    return `Closeout retried and archived with ${result.recaps_generated} recap(s).`;
  }
  return `Convention archived with ${result.recaps_generated} recap(s).`;
}

function formatAutomationSource(source: string | null) {
  if (source === 'cron_close') return 'Auto-close';
  if (source === 'cron_retry') return 'Auto-retry';
  if (source === 'admin_close') return 'Admin close';
  if (source === 'admin_retry') return 'Admin retry';
  if (source === 'admin_regenerate') return 'Admin regenerate';
  return 'None';
}

function formatAutomationEligibility(health: ConventionLifecycleHealthResult['diagnostics']) {
  if (health.closeoutManualRetryRequired) return 'Manual retry required';
  if (health.closeoutAutoRetryEligible) return 'Auto-retry eligible';
  if (health.automationEligibleForAutoClose) return 'Auto-close eligible';
  if (health.automationEligibleForRetry) return 'Auto-retry eligible';
  return 'Not eligible';
}

function formatCloseoutStep(step: string | null) {
  if (!step) return 'Not started';
  return step
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
