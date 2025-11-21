import { supabase } from '../../../lib/supabase';
import { captureHandledException, captureSupabaseError } from '../../../lib/sentry';
import { emitGameplayEvent } from '../../events';

export type ConventionSummary = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
};

export const CONVENTIONS_QUERY_KEY = 'conventions';
export const CONVENTIONS_STALE_TIME = 5 * 60_000;
export const PROFILE_CONVENTIONS_QUERY_KEY = 'profile-conventions';

export async function fetchConventions(): Promise<ConventionSummary[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('conventions')
    .select('id, slug, name, location, start_date, end_date, timezone')
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.fetchConventions',
      action: 'select',
    });
    throw new Error(`We couldn't load conventions: ${error.message}`);
  }

  return (data ?? []).map((convention: any) => ({
    id: convention.id,
    slug: convention.slug,
    name: convention.name,
    location: convention.location ?? null,
    start_date: convention.start_date ?? null,
    end_date: convention.end_date ?? null,
    timezone: convention.timezone ?? 'UTC',
  }));
}

export const createConventionsQueryOptions = () => ({
  queryKey: [CONVENTIONS_QUERY_KEY],
  queryFn: () => fetchConventions(),
  staleTime: CONVENTIONS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export async function fetchProfileConventionIds(profileId: string): Promise<string[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('profile_conventions')
    .select('convention_id')
    .eq('profile_id', profileId);

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.fetchProfileConventionIds',
      action: 'select',
      profileId,
    });
    throw new Error(`We couldn't load your convention opt-ins: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.convention_id);
}

export async function optInToConvention(profileId: string, conventionId: string): Promise<void> {
  const client = supabase as any;
  const { error } = await client
    .from('profile_conventions')
    .upsert(
      { profile_id: profileId, convention_id: conventionId },
      { onConflict: 'profile_id, convention_id' }
    );

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.optInToConvention',
      action: 'upsert',
      profileId,
      conventionId,
    });
    throw new Error(`We couldn't save your convention opt-in: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  emitGameplayEvent({
    type: 'convention_joined',
    conventionId,
    payload: {
      profile_id: profileId,
      convention_id: conventionId,
    },
  }).catch((error) => {
    captureHandledException(error, {
      scope: 'conventions.optInToConvention.eventEmission',
      profileId,
      conventionId,
    });
  });
}

export async function optOutOfConvention(profileId: string, conventionId: string): Promise<void> {
  const client = supabase as any;
  const { error } = await client
    .from('profile_conventions')
    .delete()
    .eq('profile_id', profileId)
    .eq('convention_id', conventionId);

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.optOutOfConvention',
      action: 'delete',
      profileId,
      conventionId,
    });
    throw new Error(`We couldn't remove your convention opt-in: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  emitGameplayEvent({
    type: 'convention_left',
    conventionId,
    payload: {
      profile_id: profileId,
      convention_id: conventionId,
    },
  }).catch((error) => {
    captureHandledException(error, {
      scope: 'conventions.optOutOfConvention.eventEmission',
      profileId,
      conventionId,
    });
  });
}

export async function addFursuitConvention(fursuitId: string, conventionId: string): Promise<void> {
  const client = supabase as any;
  const { error } = await client
    .from('fursuit_conventions')
    .upsert(
      { fursuit_id: fursuitId, convention_id: conventionId },
      { onConflict: 'fursuit_id, convention_id' }
    );

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.addFursuitConvention',
      action: 'upsert',
      fursuitId,
      conventionId,
    });
    throw new Error(`We couldn't add that convention to the fursuit: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  emitGameplayEvent({
    type: 'fursuit_convention_joined',
    conventionId,
    payload: {
      fursuit_id: fursuitId,
      convention_id: conventionId,
    },
  }).catch((error) => {
    captureHandledException(error, {
      scope: 'conventions.addFursuitConvention.eventEmission',
      fursuitId,
      conventionId,
    });
  });
}

export async function removeFursuitConvention(fursuitId: string, conventionId: string): Promise<void> {
  const client = supabase as any;
  const { error } = await client
    .from('fursuit_conventions')
    .delete()
    .eq('fursuit_id', fursuitId)
    .eq('convention_id', conventionId);

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.removeFursuitConvention',
      action: 'delete',
      fursuitId,
      conventionId,
    });
    throw new Error(`We couldn't remove that convention from the fursuit: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  emitGameplayEvent({
    type: 'fursuit_convention_left',
    conventionId,
    payload: {
      fursuit_id: fursuitId,
      convention_id: conventionId,
    },
  }).catch((error) => {
    captureHandledException(error, {
      scope: 'conventions.removeFursuitConvention.eventEmission',
      fursuitId,
      conventionId,
    });
  });
}
