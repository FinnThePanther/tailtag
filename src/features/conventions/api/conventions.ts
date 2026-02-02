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

export const CONVENTIONS_QUERY_KEY = 'conventions';
export const CONVENTIONS_STALE_TIME = 5 * 60_000;
export const PROFILE_CONVENTIONS_QUERY_KEY = 'profile-conventions';

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
        'latitude',
        'longitude',
        'geofence_radius_meters',
        'geofence_enabled',
        'location_verification_required',
      ].join(', ')
    )
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
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
    latitude: convention.latitude ?? null,
    longitude: convention.longitude ?? null,
    geofence_radius_meters: convention.geofence_radius_meters ?? null,
    geofence_enabled: Boolean(convention.geofence_enabled),
    location_verification_required: Boolean(convention.location_verification_required),
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
    throw new Error(`We couldn't load your convention opt-ins: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.convention_id);
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
      { onConflict: 'fursuit_id, convention_id' }
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

export async function removeFursuitConvention(fursuitId: string, conventionId: string): Promise<void> {
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
