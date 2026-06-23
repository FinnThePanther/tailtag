'use client';

import { useState, useTransition } from 'react';

import {
  createConventionDraftFromSuggestionAction,
  updateEventSuggestionStatusAction,
} from '@/app/(dashboard)/event-suggestions/actions';
import type { EventSuggestionStatus } from '@/lib/data';

type ConventionOption = {
  id: string;
  name: string;
};

type Props = {
  suggestionId: string;
  status: EventSuggestionStatus;
  convertedConventionId: string | null;
  canCreateDraft: boolean;
  conventions: ConventionOption[];
};

export function EventSuggestionActions({
  suggestionId,
  status,
  convertedConventionId,
  canCreateDraft,
  conventions,
}: Props) {
  const [resolutionReason, setResolutionReason] = useState('');
  const [duplicateOfConventionId, setDuplicateOfConventionId] = useState('');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const isActive = status === 'new' || status === 'reviewing';
  const canReopen = !isActive && !convertedConventionId;

  const updateStatus = (nextStatus: EventSuggestionStatus) => {
    setMessage(null);
    startTransition(async () => {
      try {
        await updateEventSuggestionStatusAction({
          suggestionId,
          status: nextStatus,
          resolutionReason: resolutionReason || null,
          duplicateOfConventionId: duplicateOfConventionId || null,
        });
        setMessage({ tone: 'success', text: 'Updated' });
      } catch (error) {
        setMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'Could not update suggestion.',
        });
      }
    });
  };

  const createDraft = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        await createConventionDraftFromSuggestionAction({ suggestionId });
        setMessage({ tone: 'success', text: 'Draft created' });
      } catch (error) {
        setMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'Could not create draft.',
        });
      }
    });
  };

  return (
    <div className="min-w-64 space-y-3 text-xs text-slate-200">
      <textarea
        value={resolutionReason}
        onChange={(event) => setResolutionReason(event.target.value)}
        placeholder="Resolution reason"
        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary"
        rows={2}
      />
      <select
        value={duplicateOfConventionId}
        onChange={(event) => setDuplicateOfConventionId(event.target.value)}
        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary"
      >
        <option value="">Duplicate convention link</option>
        {conventions.map((convention) => (
          <option
            key={convention.id}
            value={convention.id}
          >
            {convention.name}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        {status === 'new' ? (
          <button
            type="button"
            onClick={() => updateStatus('reviewing')}
            disabled={isPending}
            className="rounded-lg border border-border px-3 py-1 font-semibold text-slate-100 transition hover:border-primary disabled:opacity-50"
          >
            Review
          </button>
        ) : null}
        {isActive ? (
          <>
            <button
              type="button"
              onClick={() => updateStatus('accepted')}
              disabled={isPending}
              className="rounded-lg border border-emerald-500/60 px-3 py-1 font-semibold text-emerald-100 transition hover:bg-emerald-500/10 disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => updateStatus('declined')}
              disabled={isPending}
              className="rounded-lg border border-amber-500/60 px-3 py-1 font-semibold text-amber-100 transition hover:bg-amber-500/10 disabled:opacity-50"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => updateStatus('duplicate')}
              disabled={isPending}
              className="rounded-lg border border-sky-500/60 px-3 py-1 font-semibold text-sky-100 transition hover:bg-sky-500/10 disabled:opacity-50"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => updateStatus('spam')}
              disabled={isPending}
              className="rounded-lg border border-red-500/60 px-3 py-1 font-semibold text-red-100 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              Spam
            </button>
          </>
        ) : null}
        {canReopen ? (
          <button
            type="button"
            onClick={() => updateStatus('reviewing')}
            disabled={isPending}
            className="rounded-lg border border-border px-3 py-1 font-semibold text-slate-100 transition hover:border-primary disabled:opacity-50"
          >
            Reopen
          </button>
        ) : null}
        {status === 'accepted' && canCreateDraft && !convertedConventionId ? (
          <button
            type="button"
            onClick={createDraft}
            disabled={isPending}
            className="rounded-lg bg-primary px-3 py-1 font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
          >
            Create draft
          </button>
        ) : null}
      </div>
      {convertedConventionId ? <p className="text-muted">Converted to convention draft.</p> : null}
      {message ? (
        <p className={message.tone === 'error' ? 'text-red-200' : 'text-primary'}>{message.text}</p>
      ) : null}
    </div>
  );
}
