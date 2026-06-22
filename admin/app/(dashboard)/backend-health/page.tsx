import { Activity, Clock, RotateCcw, Skull, TimerReset } from 'lucide-react';

import { Card } from '@/components/card';
import { Metric } from '@/components/metric';
import { Table } from '@/components/table';
import { requireAdminDataContext } from '@/lib/auth';
import { captureSupabaseError } from '@/lib/sentry';
import {
  fetchBackendWorkerHealth,
  fetchDeadLetteredGameplayEvents,
  fetchGameplayQueueHealth,
  fetchRetryingGameplayEvents,
  type BackendWorkerHealthRow,
  type GameplayQueueHealthRow,
} from '@/lib/data';

export default async function BackendHealthPage() {
  const { supabase } = await requireAdminDataContext();
  let queueHealthUnavailable = false;
  let retryingEventsUnavailable = false;
  let deadLetteredEventsUnavailable = false;
  let workerHealthUnavailable = false;

  const [queueHealth, retryingEvents, deadLetteredEvents, workerHealth] = await Promise.all([
    fetchGameplayQueueHealth(supabase)
      .then((health) => {
        if (!health) {
          queueHealthUnavailable = true;
          return emptyGameplayQueueHealth();
        }

        return health;
      })
      .catch((error) => {
        captureSupabaseError(error, {
          scope: 'admin.backend-health',
          action: 'fetch_gameplay_queue_health',
        });
        console.error('[admin] Failed to load gameplay queue health', error);
        queueHealthUnavailable = true;
        return emptyGameplayQueueHealth();
      }),
    fetchRetryingGameplayEvents(supabase, 25).catch((error) => {
      captureSupabaseError(error, {
        scope: 'admin.backend-health',
        action: 'fetch_retrying_gameplay_events',
      });
      console.error('[admin] Failed to load retrying gameplay events', error);
      retryingEventsUnavailable = true;
      return [];
    }),
    fetchDeadLetteredGameplayEvents(supabase, 25).catch((error) => {
      captureSupabaseError(error, {
        scope: 'admin.backend-health',
        action: 'fetch_dead_lettered_gameplay_events',
      });
      console.error('[admin] Failed to load dead-lettered gameplay events', error);
      deadLetteredEventsUnavailable = true;
      return [];
    }),
    fetchBackendWorkerHealth(supabase).catch((error) => {
      captureSupabaseError(error, {
        scope: 'admin.backend-health',
        action: 'fetch_backend_worker_health',
      });
      console.error('[admin] Failed to load backend worker health', error);
      workerHealthUnavailable = true;
      return [] as BackendWorkerHealthRow[];
    }),
  ]);

  const failingWorkers = workerHealth.filter(
    (worker) =>
      worker.latest_status === 'failed' ||
      worker.latest_status === 'partial' ||
      worker.recent_failure_count > 0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        <Metric
          label="Queue depth"
          value={queueHealth.queue_depth}
          hint={`${queueHealth.visible_queue_depth} visible`}
          icon={<ActivityIcon />}
        />
        <Metric
          label="Oldest visible"
          value={formatAge(queueHealth.oldest_visible_message_age_seconds)}
          hint={formatDateTime(queueHealth.oldest_visible_message_enqueued_at)}
          icon={
            <Clock
              size={16}
              className="text-primary"
            />
          }
        />
        <Metric
          label="Oldest event"
          value={formatAge(queueHealth.oldest_unprocessed_event_age_seconds)}
          hint={formatDateTime(queueHealth.oldest_unprocessed_event_received_at)}
          icon={
            <TimerReset
              size={16}
              className="text-primary"
            />
          }
        />
        <Metric
          label="Retrying"
          value={queueHealth.retrying_event_count}
          hint="Unprocessed events"
          icon={
            <RotateCcw
              size={16}
              className="text-primary"
            />
          }
        />
        <Metric
          label="Dead letters"
          value={queueHealth.dead_lettered_event_count}
          hint="Archived failures"
          icon={
            <Skull
              size={16}
              className="text-primary"
            />
          }
        />
      </div>

      {queueHealthUnavailable ? (
        <Card
          title="Gameplay queue health unavailable"
          subtitle="The dashboard could not load queue internals from the health RPC"
        >
          <p className="text-sm text-muted">
            Event failure tables may still load, but queue depth and age metrics are unavailable.
          </p>
        </Card>
      ) : null}

      {retryingEventsUnavailable || deadLetteredEventsUnavailable ? (
        <Card
          title="Gameplay event details partially unavailable"
          subtitle="The dashboard could not load every event detail query"
        >
          <p className="text-sm text-muted">
            {retryingEventsUnavailable ? 'Retrying event rows are unavailable. ' : ''}
            {deadLetteredEventsUnavailable ? 'Dead-lettered event rows are unavailable.' : ''}
          </p>
        </Card>
      ) : null}

      <Card
        title="Gameplay failure groups"
        subtitle="Retrying and dead-lettered events grouped by event type and convention"
      >
        <Table
          headers={[
            'Event type',
            'Convention',
            'Retrying',
            'Dead letters',
            'Last attempt',
            'Latest dead letter',
          ]}
        >
          {queueHealth.grouped_failures.map((group) => (
            <tr key={`${group.type}:${group.convention_id ?? 'global'}`}>
              <td className="px-4 py-3 font-semibold text-white">{group.type}</td>
              <td className="px-4 py-3">
                <div className="text-slate-200">{group.convention_name ?? 'Global'}</div>
                {group.convention_id ? (
                  <div className="max-w-64 truncate text-xs text-muted">{group.convention_id}</div>
                ) : null}
              </td>
              <td className="px-4 py-3 text-slate-200">{group.retrying_count}</td>
              <td className="px-4 py-3 text-slate-200">{group.dead_lettered_count}</td>
              <td className="px-4 py-3 text-slate-200">
                {formatDateTime(group.latest_attempted_at)}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {formatDateTime(group.latest_dead_lettered_at)}
              </td>
            </tr>
          ))}
          {!queueHealth.grouped_failures.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={6}
              >
                No retrying or dead-lettered gameplay events.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>

      <Card
        title="Retrying gameplay events"
        subtitle="Events that have failed at least once and are still eligible for processing"
      >
        <Table headers={['Event', 'Context', 'Attempts', 'Last attempted', 'Last error']}>
          {retryingEvents.map((event) => (
            <tr key={event.event_id}>
              <td className="px-4 py-3">
                <div className="font-semibold text-white">{event.type}</div>
                <div className="max-w-72 truncate text-xs text-muted">{event.event_id}</div>
              </td>
              <td className="px-4 py-3 text-xs text-muted">
                <p>User {event.user_id}</p>
                <p>Convention {event.convention_id ?? '—'}</p>
                <p>Queue message {event.queue_message_id ?? '—'}</p>
              </td>
              <td className="px-4 py-3 text-slate-200">{event.retry_count}</td>
              <td className="px-4 py-3 text-slate-200">
                {formatDateTime(event.last_attempted_at)}
              </td>
              <td className="px-4 py-3">
                <div className="max-w-xl truncate text-sm text-slate-200">
                  {event.last_error ?? 'No last_error recorded.'}
                </div>
              </td>
            </tr>
          ))}
          {!retryingEvents.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={5}
              >
                No gameplay events are currently retrying.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>

      <Card
        title="Gameplay dead letters"
        subtitle="Unprocessed gameplay events archived after queue retry exhaustion"
      >
        <Table headers={['Event', 'Context', 'Attempts', 'Dead-lettered', 'Failure']}>
          {deadLetteredEvents.map((event) => (
            <tr key={event.event_id}>
              <td className="px-4 py-3">
                <div className="font-semibold text-white">{event.type}</div>
                <div className="max-w-72 truncate text-xs text-muted">{event.event_id}</div>
              </td>
              <td className="px-4 py-3 text-xs text-muted">
                <p>User {event.user_id}</p>
                <p>Convention {event.convention_id ?? '—'}</p>
                <p>Queue message {event.queue_message_id ?? '—'}</p>
              </td>
              <td className="px-4 py-3 text-slate-200">{event.retry_count}</td>
              <td className="px-4 py-3 text-slate-200">{formatDateTime(event.dead_lettered_at)}</td>
              <td className="px-4 py-3">
                <div className="max-w-xl text-sm text-slate-200">
                  {event.dead_letter_reason ?? 'Dead-lettered without a reason.'}
                </div>
                <div className="mt-1 max-w-xl truncate text-xs text-muted">
                  {event.last_error ?? 'No last_error recorded.'}
                </div>
              </td>
            </tr>
          ))}
          {!deadLetteredEvents.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={5}
              >
                No gameplay dead letters need attention.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>

      <Card
        title="Recent worker failures"
        subtitle="Durable worker run failures are separate from queue backlog and event failures"
      >
        {workerHealthUnavailable ? (
          <p className="text-sm text-muted">
            Backend worker health is temporarily unavailable. Worker records may still be written.
          </p>
        ) : (
          <Table headers={['Worker', 'Status', 'Failures in 24h', 'Last run', 'Last error']}>
            {failingWorkers.map((worker) => (
              <tr key={worker.worker_name}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-white">{worker.display_name}</div>
                  <div className="text-xs text-muted">Source {worker.latest_source ?? '—'}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={worker.latest_status} />
                </td>
                <td className="px-4 py-3 text-slate-200">{worker.recent_failure_count}</td>
                <td className="px-4 py-3 text-slate-200">
                  {formatDateTime(worker.latest_started_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-xl truncate text-sm text-slate-200">
                    {worker.latest_error_message ?? 'No latest error recorded.'}
                  </div>
                </td>
              </tr>
            ))}
            {!failingWorkers.length ? (
              <tr>
                <td
                  className="px-4 py-3 text-sm text-muted"
                  colSpan={5}
                >
                  No recent backend worker failures.
                </td>
              </tr>
            ) : null}
          </Table>
        )}
      </Card>

      <Card
        title="Push and admin errors"
        subtitle="Push delivery failures remain separate from gameplay queue health"
      >
        <p className="text-sm text-muted">
          Review push notification and admin error log entries on the Errors page.
        </p>
      </Card>
    </div>
  );
}

function emptyGameplayQueueHealth(): GameplayQueueHealthRow {
  return {
    queue_depth: 0,
    visible_queue_depth: 0,
    oldest_visible_message_enqueued_at: null,
    oldest_visible_message_age_seconds: null,
    oldest_unprocessed_event_received_at: null,
    oldest_unprocessed_event_age_seconds: null,
    retrying_event_count: 0,
    dead_lettered_event_count: 0,
    grouped_failures: [],
  };
}

function ActivityIcon() {
  return (
    <Activity
      size={16}
      className="text-primary"
    />
  );
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function formatAge(value: number | null): string {
  if (value === null) {
    return '—';
  }

  if (value < 60) {
    return `${value}s`;
  }

  if (value < 3600) {
    return `${Math.floor(value / 60)}m`;
  }

  if (value < 86400) {
    return `${Math.floor(value / 3600)}h`;
  }

  return `${Math.floor(value / 86400)}d`;
}

function StatusBadge({ status }: { status: string | null }) {
  const label = status ?? 'no runs';
  const className =
    status === 'succeeded'
      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
      : status === 'failed'
        ? 'border-red-400/40 bg-red-500/10 text-red-100'
        : status === 'partial'
          ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
          : status === 'running'
            ? 'border-sky-400/40 bg-sky-500/10 text-sky-100'
            : 'border-border bg-background text-muted';

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${className}`}
    >
      {label}
    </span>
  );
}
