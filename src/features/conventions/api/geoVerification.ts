import { supabase } from '../../../lib/supabase';

export type LocationVerificationRequest = {
  profileId: string;
  conventionId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type LocationVerificationResponse = {
  verified: boolean;
  distance_meters: number | null;
  convention_name: string;
  geofence_radius_meters: number;
  effective_radius_meters: number | null;
  error?: string;
};

export async function verifyConventionLocation(
  params: LocationVerificationRequest,
): Promise<LocationVerificationResponse> {
  const { data, error } = await supabase.rpc('verify_convention_location', {
    p_profile_id: params.profileId,
    p_convention_id: params.conventionId,
    p_user_lat: params.latitude,
    p_user_lng: params.longitude,
    p_accuracy: params.accuracy,
  });

  if (error) {
    throw error;
  }

  return data as LocationVerificationResponse;
}
