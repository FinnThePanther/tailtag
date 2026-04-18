import { supabase } from '../../../lib/supabase';
import { emitGameplayEvent } from '../../events';

export type ConventionSummary = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  status?: string;
  local_day?: string | null;
  is_joinable?: boolean;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number | null;
  geofence_enabled: boolean;
  location_verification_required: boolean;
};

export type VerifiedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type OptInParams = {
  profileId: string;
  conventionId: string;
  verifiedLocation?: VerifiedLocation | null;
  verificationMethod?: 'none' | 'gps' | 'manual_override' | 'grandfathered';
  overrideReason?: string | null;
};

export type PastConventionRecap = {
  recapId: string;
  conventionId: string;
  conventionName: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  generatedAt: string;
  finalRank: number | null;
  catchCount: number;
  uniqueFursuitsCaughtCount: number;
  ownFursuitsCaughtCount: number;
  uniqueCatchersForOwnFursuitsCount: number;
  dailyTasksCompletedCount: number;
  achievementsUnlockedCount: number;
  summary: Record<string, unknown>;
};

export const CONVENTIONS_QUERY_KEY = 'conventions';
export const JOINABLE_CONVENTIONS_QUERY_KEY = 'joinable-conventions';
export const CONVENTIONS_STALE_TIME = 5 * 60_000;
export const PROFILE_CONVENTIONS_QUERY_KEY = 'profile-conventions';
export const ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY = 'active-profile-conventions';
export const PAST_CONVENTION_RECAPS_QUERY_KEY = 'past-convention-recaps';

function mapConventionSummary(convention: any): ConventionSummary {
  return {
    id: convention.id,
    slug: convention.slug,
    name: convention.name,
    location: convention.location ?? null,
    start_date: convention.start_date ?? null,
    end_date: convention.end_date ?? null,
    timezone: convention.timezone ?? 'UTC',
    status: convention.status ?? undefined,
    local_day: convention.local_day ?? null,
    is_joinable: typeof convention.is_joinable === 'boolean' ? convention.is_joinable : undefined,
    latitude:
      convention.latitude === null || convention.latitude === undefined
        ? null
        : Number(convention.latitude),
    longitude:
      convention.longitude === null || convention.longitude === undefined
        ? null
        : Number(convention.longitude),
    geofence_radius_meters: convention.geofence_radius_meters ?? null,
    geofence_enabled: Boolean(convention.geofence_enabled),
    location_verification_required: Boolean(convention.location_verification_required),
  };
}

function mapPastConventionRecap(row: any): PastConventionRecap {
  return {
    recapId: row.recap_id,
    conventionId: row.convention_id,
    conventionName: row.convention_name,
    location: row.location ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    generatedAt: row.generated_at,
    finalRank: row.final_rank ?? null,
    catchCount: Number(row.catch_count ?? 0),
    uniqueFursuitsCaughtCount: Number(row.unique_fursuits_caught_count ?? 0),
    ownFursuitsCaughtCount: Number(row.own_fursuits_caught_count ?? 0),
    uniqueCatchersForOwnFursuitsCount: Number(row.unique_catchers_for_own_fursuits_count ?? 0),
    dailyTasksCompletedCount: Number(row.daily_tasks_completed_count ?? 0),
    achievementsUnlockedCount: Number(row.achievements_unlocked_count ?? 0),
    summary:
      row.summary && typeof row.summary === 'object'
        ? (row.summary as Record<string, unknown>)
        : {},
  };
}

export async function fetchConventions(): Promise<ConventionSummary[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('conventions')
    .select(
      [
        'id',
        'slug',
        'name',
        'location',
        'start_date',
        'end_date',
        'timezone',
        'status',
        'latitude',
        'longitude',
        'geofence_radius_meters',
        'geofence_enabled',
        'location_verification_required',
      ].join(', '),
    )
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`We couldn't load conventions: ${error.message}`);
  }

  return (data ?? []).map(mapConventionSummary);
}

export async function fetchJoinableConventions(): Promise<ConventionSummary[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_joinable_conventions');

  if (error) {
    throw new Error(`We couldn't load live conventions: ${error.message}`);
  }

  return (data ?? []).map(mapConventionSummary);
}

export const createConventionsQueryOptions = () => ({
  queryKey: [CONVENTIONS_QUERY_KEY],
  queryFn: () => fetchConventions(),
  staleTime: CONVENTIONS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export const createJoinableConventionsQueryOptions = () => ({
  queryKey: [JOINABLE_CONVENTIONS_QUERY_KEY],
  queryFn: () => fetchJoinableConventions(),
  staleTime: CONVENTIONS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export async function fetchPastConventionRecaps(): Promise<PastConventionRecap[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_my_convention_recaps');

  if (error) {
    throw new Error(`We couldn't load your past conventions: ${error.message}`);
  }

  return (data ?? []).map(mapPastConventionRecap);
}

export const createPastConventionRecapsQueryOptions = () => ({
  queryKey: [PAST_CONVENTION_RECAPS_QUERY_KEY],
  queryFn: () => fetchPastConventionRecaps(),
  staleTime: CONVENTIONS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export async function fetchProfileConventionIds(profileId: string): Promise<string[]> {
  const client = supabase as any;
  const { data, error } = await client
    .from('profile_conventions')
    .select('convention_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`We couldn't load your convention opt-ins: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.convention_id);
}

export async function fetchActiveProfileConventionIds(profileId: string): Promise<string[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_active_profile_convention_ids', {
    p_profile_id: profileId,
  });

  if (error) {
    throw new Error(`We couldn't load your live convention opt-ins: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.convention_id);
}

export async function fetchActiveSharedConventionIds(
  profileId: string,
  fursuitId: string,
): Promise<string[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_active_shared_convention_ids', {
    p_profile_id: profileId,
    p_fursuit_id: fursuitId,
  });

  if (error) {
    throw new Error(`We couldn't resolve your live shared conventions: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.convention_id);
}

export async function fetchActiveFursuitConventionIds(fursuitId: string): Promise<string[]> {
  const [{ data: fursuitConventions, error }, joinableConventions] = await Promise.all([
    (supabase as any)
      .from('fursuit_conventions')
      .select('convention_id')
      .eq('fursuit_id', fursuitId),
    fetchJoinableConventions(),
  ]);

  if (error) {
    throw new Error(`We couldn't load this fursuit's live conventions: ${error.message}`);
  }

  const joinableConventionIds = new Set(joinableConventions.map((convention) => convention.id));
  return (fursuitConventions ?? [])
    .map((row: any) => row.convention_id)
    .filter((conventionId: string | null): conventionId is string =>
      Boolean(conventionId && joinableConventionIds.has(conventionId)),
    );
}

export async function optInToConvention(params: OptInParams): Promise<void> {
  const {
    profileId,
    conventionId,
    verifiedLocation = null,
    verificationMethod = verifiedLocation ? 'gps' : 'none',
    overrideReason = null,
  } = params;

  const client = supabase as any;
  const { error } = await client.rpc('opt_in_to_convention', {
    p_profile_id: profileId,
    p_convention_id: conventionId,
    p_verified_location: verifiedLocation
      ? {
          lat: verifiedLocation.latitude,
          lng: verifiedLocation.longitude,
          accuracy: verifiedLocation.accuracy,
        }
      : null,
    p_verification_method: verificationMethod,
    p_override_reason: overrideReason,
  });

  if (error) {
    throw new Error(`We couldn't save your convention opt-in: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  void emitGameplayEvent({
    type: 'convention_joined',
    conventionId,
    payload: {
      profile_id: profileId,
      convention_id: conventionId,
      verification_method: verificationMethod,
    },
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
    throw new Error(`We couldn't remove your convention opt-in: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  void emitGameplayEvent({
    type: 'convention_left',
    conventionId,
    payload: {
      profile_id: profileId,
      convention_id: conventionId,
    },
  });
}

export async function addFursuitConvention(fursuitId: string, conventionId: string): Promise<void> {
  const client = supabase as any;
  const { error } = await client
    .from('fursuit_conventions')
    .upsert(
      { fursuit_id: fursuitId, convention_id: conventionId },
      { onConflict: 'fursuit_id, convention_id' },
    );

  if (error) {
    throw new Error(`We couldn't add that convention to the fursuit: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  void emitGameplayEvent({
    type: 'fursuit_convention_joined',
    conventionId,
    payload: {
      fursuit_id: fursuitId,
      convention_id: conventionId,
    },
  });
}

export async function removeFursuitConvention(
  fursuitId: string,
  conventionId: string,
): Promise<void> {
  const client = supabase as any;
  const { error } = await client
    .from('fursuit_conventions')
    .delete()
    .eq('fursuit_id', fursuitId)
    .eq('convention_id', conventionId);

  if (error) {
    throw new Error(`We couldn't remove that convention from the fursuit: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  void emitGameplayEvent({
    type: 'fursuit_convention_left',
    conventionId,
    payload: {
      fursuit_id: fursuitId,
      convention_id: conventionId,
    },
  });
}
