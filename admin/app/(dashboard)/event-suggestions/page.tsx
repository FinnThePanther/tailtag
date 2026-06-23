import Link from 'next/link';

import { Card } from '@/components/card';
import { EventSuggestionActions } from '@/components/event-suggestion-actions';
import { EventSuggestionFilters } from '@/components/event-suggestion-filters';
import { Table } from '@/components/table';
import { requireAdminDataContext } from '@/lib/auth';
import { canManageConventionConfig } from '@/lib/admin-permissions';
import {
  fetchConventions,
  fetchEventSuggestions,
  type EventSuggestionRow,
  type EventSuggestionStatus,
} from '@/lib/data';

type SearchParams = {
  status?: string;
};

const REVIEW_ROLES = ['owner', 'organizer', 'moderator'] as const;
const EVENT_TYPE_LABELS: Record<string, string> = {
  convention: 'Convention',
  furmeet: 'Furmeet',
  public_meetup: 'Public meetup',
  private_event: 'Private event',
  other: 'Other',
};
const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Public',
  invite_only: 'Invite-only',
  private: 'Private',
  not_sure: 'Not sure',
};
const DATE_STATUS_LABELS: Record<string, string> = {
  known: 'Known',
  approximate: 'Approximate',
  not_announced: 'Not announced',
};
const STATUS_LABELS: Record<EventSuggestionStatus, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  accepted: 'Accepted',
  declined: 'Declined',
  duplicate: 'Duplicate',
  spam: 'Spam',
};
const STATUS_OPTIONS = new Set([
  'active',
  'all',
  'new',
  'reviewing',
  'accepted',
  'declined',
  'duplicate',
  'spam',
]);

function normalizeStatus(value: string | undefined) {
  return STATUS_OPTIONS.has(value ?? '')
    ? (value as EventSuggestionStatus | 'active' | 'all')
    : 'active';
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatDateRange(suggestion: EventSuggestionRow) {
  if (suggestion.date_status !== 'known') {
    return DATE_STATUS_LABELS[suggestion.date_status] ?? suggestion.date_status;
  }

  const start = formatDate(suggestion.start_date);
  const end = formatDate(suggestion.end_date);
  return end ? `${start} → ${end}` : (start ?? 'Known dates');
}

function formatSubmittedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function hostLabel(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function safeHttpUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function relationValue(
  value: EventSuggestionRow['converted_convention'] | EventSuggestionRow['duplicate_convention'],
) {
  return Array.isArray(value) ? value[0] : value;
}

function StatusBadge({ status }: { status: EventSuggestionStatus }) {
  const tone =
    status === 'accepted'
      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
      : status === 'declined' || status === 'spam'
        ? 'border-red-400/40 bg-red-500/10 text-red-100'
        : status === 'duplicate'
          ? 'border-sky-400/40 bg-sky-500/10 text-sky-100'
          : 'border-border bg-background text-slate-200';

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default async function EventSuggestionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile, supabase } = await requireAdminDataContext([...REVIEW_ROLES]);
  const status = normalizeStatus(searchParams.status);
  const [suggestions, conventions] = await Promise.all([
    fetchEventSuggestions(supabase, { status }),
    fetchConventions(supabase),
  ]);
  const canCreateDraft = canManageConventionConfig(profile);
  const conventionOptions = conventions.map((convention) => ({
    id: convention.id,
    name: convention.name,
  }));

  return (
    <div className="space-y-4">
      <Card
        title="Filters"
        subtitle="Active shows new and reviewing suggestions"
      >
        <EventSuggestionFilters initialStatus={status} />
      </Card>
      <Card
        title="Event Suggestions"
        subtitle={`Total: ${suggestions.length}`}
      >
        <Table
          headers={['Event', 'Timing', 'Location', 'Submitter', 'Review', 'Context', 'Actions']}
        >
          {suggestions.map((suggestion) => {
            const convertedConvention = relationValue(suggestion.converted_convention);
            const duplicateConvention = relationValue(suggestion.duplicate_convention);
            const officialUrl = safeHttpUrl(suggestion.official_url);

            return (
              <tr key={suggestion.id}>
                <td className="px-4 py-3 text-slate-200">
                  <div className="space-y-2">
                    <div>
                      <p className="font-semibold text-white">{suggestion.event_name}</p>
                      <p className="text-xs text-muted">
                        {EVENT_TYPE_LABELS[suggestion.event_type] ?? suggestion.event_type} ·{' '}
                        {VISIBILITY_LABELS[suggestion.event_visibility] ??
                          suggestion.event_visibility}
                      </p>
                    </div>
                    {officialUrl ? (
                      <a
                        href={officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-xs text-xs font-semibold text-primary underline decoration-primary/40 underline-offset-4"
                      >
                        {hostLabel(officialUrl)}
                      </a>
                    ) : suggestion.official_url ? (
                      <p className="max-w-xs truncate text-xs text-muted">
                        {suggestion.official_url}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-200">
                  <div>{formatDateRange(suggestion)}</div>
                  {suggestion.date_notes ? (
                    <p className="mt-1 max-w-xs text-xs text-muted">{suggestion.date_notes}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm text-slate-200">
                  <div>{[suggestion.city_region, suggestion.country].join(', ')}</div>
                  {suggestion.venue_name ? (
                    <p className="mt-1 text-xs text-muted">{suggestion.venue_name}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm text-slate-200">
                  <div>{suggestion.submitter_relationship}</div>
                  <p className="mt-1 text-xs capitalize text-muted">
                    {suggestion.contact_method}: {suggestion.contact_value}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm text-slate-200">
                  <div className="space-y-2">
                    <StatusBadge status={suggestion.status} />
                    <p className="text-xs text-muted">
                      Submitted {formatSubmittedAt(suggestion.created_at)}
                    </p>
                    {suggestion.resolution_reason ? (
                      <p className="max-w-xs text-xs text-slate-300">
                        {suggestion.resolution_reason}
                      </p>
                    ) : null}
                    {duplicateConvention ? (
                      <Link
                        href={`/conventions/${duplicateConvention.id}`}
                        className="block text-xs font-semibold text-sky-100 underline decoration-sky-400/50 underline-offset-4"
                      >
                        Duplicate of {duplicateConvention.name}
                      </Link>
                    ) : null}
                    {convertedConvention ? (
                      <Link
                        href={`/conventions/${convertedConvention.id}`}
                        className="block text-xs font-semibold text-primary underline decoration-primary/50 underline-offset-4"
                      >
                        Draft: {convertedConvention.name}
                      </Link>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-200">
                  <div className="max-w-xs space-y-2">
                    {suggestion.expected_attendance ? (
                      <p className="text-xs text-muted">
                        Expected attendance: {suggestion.expected_attendance.toLocaleString()}
                      </p>
                    ) : null}
                    {suggestion.preferred_setup ? (
                      <p className="text-xs text-muted">Setup: {suggestion.preferred_setup}</p>
                    ) : null}
                    {suggestion.notes ? (
                      <p className="line-clamp-4 text-xs text-slate-300">{suggestion.notes}</p>
                    ) : null}
                    {!suggestion.expected_attendance &&
                    !suggestion.preferred_setup &&
                    !suggestion.notes ? (
                      <span className="text-muted">—</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <EventSuggestionActions
                    suggestionId={suggestion.id}
                    status={suggestion.status}
                    convertedConventionId={suggestion.converted_convention_id}
                    canCreateDraft={canCreateDraft}
                    conventions={conventionOptions}
                  />
                </td>
              </tr>
            );
          })}
          {!suggestions.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={7}
              >
                No event suggestions found.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}
