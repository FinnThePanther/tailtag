import { Card } from '@/components/card';
import { Table } from '@/components/table';
import {
  fetchAdminErrors,
  fetchDeadLetteredGameplayEvents,
  fetchGameplayDeadLetterReplayAudits,
} from '@/lib/data';
import { requireAdminDataContext } from '@/lib/auth';
import { replayGameplayDeadLettersAction } from './actions';

type ReplayAuditContext = {
  reason?: unknown;
  replay_result?: {
    status?: unknown;
    message?: unknown;
    replayed?: unknown;
    queue_message_id?: unknown;
  };
  previous_failure?: {
    last_error?: unknown;
    dead_letter_reason?: unknown;
  };
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function asReplayAuditContext(value: unknown): ReplayAuditContext {
  return value && typeof value === 'object' ? (value as ReplayAuditContext) : {};
}

export default async function ErrorsPage() {
  const { supabase, profile } = await requireAdminDataContext();
  const [deadLetteredEvents, replayAudits, errors] = await Promise.all([
    fetchDeadLetteredGameplayEvents(supabase, 25),
    fetchGameplayDeadLetterReplayAudits(supabase, 25),
    fetchAdminErrors(supabase, 50),
  ]);
  const canReplayDeadLetters = profile.role === 'owner' || profile.role === 'organizer';

  return (
    <div className="space-y-6">
      <Card
        title="Gameplay dead letters"
        subtitle="Unprocessed gameplay events archived after queue retry exhaustion"
      >
        <form
          action={replayGameplayDeadLettersAction}
          className="space-y-4"
        >
          <Table
            headers={[
              ...(canReplayDeadLetters ? ['Replay'] : []),
              'Event',
              'Failure',
              'Attempts',
              'Dead-lettered',
              'Last attempted',
            ]}
          >
            {deadLetteredEvents.map((event) => (
              <tr key={event.event_id}>
                {canReplayDeadLetters ? (
                  <td className="px-4 py-3">
                    <input
                      aria-label={`Select event ${event.event_id} for replay`}
                      type="checkbox"
                      name="event_id"
                      value={event.event_id}
                      className="h-4 w-4"
                    />
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <div className="font-semibold text-white">{event.type}</div>
                  <div className="max-w-72 truncate text-xs text-muted">{event.event_id}</div>
                  <div className="text-xs text-muted">User {event.user_id}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-xl text-sm text-slate-200">
                    {event.dead_letter_reason ?? 'Dead-lettered without a reason.'}
                  </div>
                  <div className="mt-1 max-w-xl text-xs text-muted">
                    {event.last_error ?? 'No last_error recorded.'}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-200">{event.retry_count}</td>
                <td className="px-4 py-3 text-slate-200">{formatDate(event.dead_lettered_at)}</td>
                <td className="px-4 py-3 text-slate-200">{formatDate(event.last_attempted_at)}</td>
              </tr>
            ))}
            {!deadLetteredEvents.length ? (
              <tr>
                <td
                  className="px-4 py-3 text-sm text-muted"
                  colSpan={canReplayDeadLetters ? 6 : 5}
                >
                  No gameplay dead letters need replay.
                </td>
              </tr>
            ) : null}
          </Table>
          {canReplayDeadLetters ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4 sm:flex-row sm:items-end">
              <label className="flex-1 text-sm font-medium text-slate-200">
                Replay reason
                <input
                  name="reason"
                  type="text"
                  required
                  minLength={6}
                  placeholder="Fix applied or operator reason"
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-white"
                />
              </label>
              <button
                type="submit"
                disabled={deadLetteredEvents.length === 0}
                className="rounded-md border border-primary/40 px-4 py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Replay selected
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Owner or organizer access is required to replay events.
            </p>
          )}
        </form>
      </Card>

      <Card
        title="Dead-letter replay audit"
        subtitle="Recent replay attempts and skipped events"
      >
        <Table headers={['Event', 'Result', 'Reason', 'Previous failure', 'Actor', 'Created']}>
          {replayAudits.map((audit) => {
            const context = asReplayAuditContext(audit.context);
            const result = context.replay_result ?? {};
            const previousFailure = context.previous_failure ?? {};

            return (
              <tr key={audit.id}>
                <td className="px-4 py-3 text-slate-200">{audit.entity_id ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-white">
                    {String(result.status ?? 'unknown')}
                  </div>
                  <div className="text-xs text-muted">
                    {String(result.message ?? 'No message.')}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-200">{String(context.reason ?? '—')}</td>
                <td className="px-4 py-3">
                  <div className="max-w-xl text-sm text-slate-200">
                    {String(previousFailure.dead_letter_reason ?? '—')}
                  </div>
                  <div className="mt-1 max-w-xl text-xs text-muted">
                    {String(previousFailure.last_error ?? '—')}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-200">{audit.actor_id}</td>
                <td className="px-4 py-3 text-slate-200">{formatDate(audit.created_at)}</td>
              </tr>
            );
          })}
          {!replayAudits.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={6}
              >
                No gameplay replay audit entries yet.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>

      <Card
        title="Admin errors"
        subtitle="Recent error events captured by admin_error_log"
      >
        <Table headers={['Type', 'Message', 'Severity', 'Convention', 'Occurred']}>
          {errors.map((error) => (
            <tr key={error.id}>
              <td className="px-4 py-3 text-slate-200">{error.error_type}</td>
              <td className="px-4 py-3 text-slate-200">{error.error_message}</td>
              <td className="px-4 py-3 text-slate-200">{error.severity}</td>
              <td className="px-4 py-3 text-slate-200">{error.convention_id ?? '—'}</td>
              <td className="px-4 py-3 text-slate-200">{formatDate(error.occurred_at)}</td>
            </tr>
          ))}
          {!errors.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={5}
              >
                No errors logged.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}
