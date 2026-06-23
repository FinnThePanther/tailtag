'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';
import type { EventSuggestionStatus } from '@/lib/data';

const REVIEW_ROLES = ['owner', 'organizer', 'moderator'] as const;
const DRAFT_CREATION_ROLES = ['owner', 'organizer'] as const;
const RESOLUTION_STATUSES = new Set<EventSuggestionStatus>(['declined', 'duplicate', 'spam']);

const DEFAULT_CONFIG = {
  cooldowns: { catch_seconds: 0 },
  points: { catch: 1 },
  feature_flags: { staff_mode: true },
};

type EventSuggestionForDraft = {
  id: string;
  event_name: string;
  start_date: string | null;
  end_date: string | null;
  city_region: string;
  country: string;
  venue_name: string | null;
  status: EventSuggestionStatus;
  converted_convention_id: string | null;
};

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requireResolutionReason(status: EventSuggestionStatus, resolutionReason?: string | null) {
  if (RESOLUTION_STATUSES.has(status) && !trimOrNull(resolutionReason)) {
    throw new Error('A resolution reason is required for this action.');
  }
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

function conventionLocation(suggestion: EventSuggestionForDraft) {
  return [suggestion.venue_name, suggestion.city_region, suggestion.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

async function generateConventionSlug(
  supabase: ReturnType<typeof createServiceRoleClient>,
  suggestion: EventSuggestionForDraft,
) {
  const year = suggestion.start_date ? new Date(suggestion.start_date).getUTCFullYear() : null;
  const base = toSlug([suggestion.event_name, year].filter(Boolean).join(' ')) || 'event';
  let candidate = base;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabase
      .from('conventions')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function updateEventSuggestionStatusAction(input: {
  suggestionId: string;
  status: EventSuggestionStatus;
  resolutionReason?: string | null;
  duplicateOfConventionId?: string | null;
}) {
  const { profile } = await assertAdminAction([...REVIEW_ROLES]);
  const supabase = createServiceRoleClient();

  requireResolutionReason(input.status, input.resolutionReason);

  const { data: current, error: currentError } = await (supabase as any)
    .from('event_suggestions')
    .select('id, status, converted_convention_id')
    .eq('id', input.suggestionId)
    .maybeSingle();

  if (currentError) {
    throw currentError;
  }

  if (!current) {
    throw new Error('Event suggestion not found.');
  }

  if (input.status === 'reviewing' && current.converted_convention_id) {
    throw new Error('A converted suggestion cannot be reopened.');
  }

  const update = {
    status: input.status,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
    resolution_reason: RESOLUTION_STATUSES.has(input.status)
      ? trimOrNull(input.resolutionReason)
      : null,
    duplicate_of_convention_id:
      input.status === 'duplicate' ? trimOrNull(input.duplicateOfConventionId) : null,
  };

  const { error } = await (supabase as any)
    .from('event_suggestions')
    .update(update)
    .eq('id', input.suggestionId);

  if (error) {
    throw new Error(`Failed to update event suggestion: ${error.message}`);
  }

  await logAudit({
    actorId: profile.id,
    action: 'update_event_suggestion_status',
    entityType: 'event_suggestion',
    entityId: input.suggestionId,
    context: {
      from: current.status,
      to: input.status,
      resolution_reason: update.resolution_reason,
      duplicate_of_convention_id: update.duplicate_of_convention_id,
    },
  });

  revalidatePath('/event-suggestions');
}

export async function createConventionDraftFromSuggestionAction(input: { suggestionId: string }) {
  const { profile } = await assertAdminAction([...DRAFT_CREATION_ROLES]);
  const supabase = createServiceRoleClient();

  const { data: suggestion, error: suggestionError } = await (supabase as any)
    .from('event_suggestions')
    .select(
      [
        'id',
        'event_name',
        'start_date',
        'end_date',
        'city_region',
        'country',
        'venue_name',
        'status',
        'converted_convention_id',
      ].join(', '),
    )
    .eq('id', input.suggestionId)
    .maybeSingle();

  if (suggestionError) {
    throw suggestionError;
  }

  if (!suggestion) {
    throw new Error('Event suggestion not found.');
  }

  const typedSuggestion = suggestion as EventSuggestionForDraft;

  if (typedSuggestion.status !== 'accepted') {
    throw new Error('Only accepted suggestions can create convention drafts.');
  }

  if (typedSuggestion.converted_convention_id) {
    throw new Error('This suggestion has already been converted to a convention draft.');
  }

  const slug = await generateConventionSlug(supabase, typedSuggestion);

  const { data: convention, error: conventionError } = await supabase
    .from('conventions')
    .insert({
      name: typedSuggestion.event_name.trim(),
      slug,
      start_date: typedSuggestion.start_date,
      end_date: typedSuggestion.end_date,
      location: conventionLocation(typedSuggestion) || null,
      timezone: 'UTC',
      config: DEFAULT_CONFIG,
      status: 'draft',
    })
    .select('id')
    .single();

  if (conventionError) {
    throw conventionError;
  }

  const { data: updatedSuggestion, error: updateError } = await (supabase as any)
    .from('event_suggestions')
    .update({
      status: 'accepted',
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      converted_convention_id: convention.id,
      resolution_reason: null,
      duplicate_of_convention_id: null,
    })
    .eq('id', input.suggestionId)
    .is('converted_convention_id', null)
    .select('id')
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (!updatedSuggestion) {
    await supabase.from('conventions').delete().eq('id', convention.id).eq('status', 'draft');
    throw new Error('This suggestion has already been converted to a convention draft.');
  }

  await logAudit({
    actorId: profile.id,
    action: 'create_convention_draft_from_event_suggestion',
    entityType: 'convention',
    entityId: convention.id,
    context: {
      event_suggestion_id: input.suggestionId,
      name: typedSuggestion.event_name,
      slug,
    },
  });

  revalidatePath('/event-suggestions');
  revalidatePath('/conventions');
}
