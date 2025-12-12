'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';

const CONFIG_ROLES = ['owner', 'organizer'] as const;

type ConventionConfig = {
  cooldowns?: { catch_seconds?: number | null };
  points?: { catch?: number | null };
  feature_flags?: { tag_scan?: boolean; staff_mode?: boolean };
};

export async function updateConventionConfigAction(input: {
  conventionId: string;
  catchCooldownSeconds: number | null;
  catchPoints: number | null;
  featureTagScan: boolean;
  featureStaffMode: boolean;
}) {
  const { profile } = await assertAdminAction([...CONFIG_ROLES]);
  const supabase = createServiceRoleClient();

  const { data: current } = await supabase
    .from('conventions')
    .select('config')
    .eq('id', input.conventionId)
    .single();

  const existing = (current?.config as ConventionConfig | null) ?? {};
  const next: ConventionConfig = {
    cooldowns: {
      ...existing.cooldowns,
      catch_seconds: input.catchCooldownSeconds,
    },
    points: {
      ...existing.points,
      catch: input.catchPoints,
    },
    feature_flags: {
      ...existing.feature_flags,
      tag_scan: input.featureTagScan,
      staff_mode: input.featureStaffMode,
    },
  };

  await supabase.from('conventions').update({ config: next }).eq('id', input.conventionId);

  await logAudit({
    actorId: profile.id,
    action: 'update_convention_config',
    entityType: 'convention',
    entityId: input.conventionId,
    diff: { before: existing, after: next },
  });

  revalidatePath('/conventions');
  revalidatePath(`/conventions/${input.conventionId}`);
}

export async function updateConventionGeofenceAction(input: {
  conventionId: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  geofenceEnabled: boolean;
}) {
  const { profile } = await assertAdminAction([...CONFIG_ROLES]);
  const supabase = createServiceRoleClient();

  type GeofenceSettings = {
    latitude: number | null;
    longitude: number | null;
    geofence_radius_meters: number | null;
    geofence_enabled: boolean;
    location_verification_required: boolean;
  };

  const { data: current } = await supabase
    .from('conventions')
    .select(
      [
        'latitude',
        'longitude',
        'geofence_radius_meters',
        'geofence_enabled',
        'location_verification_required',
      ].join(', ')
    )
    .eq('id', input.conventionId)
    .single();

  const before: GeofenceSettings =
    (current as GeofenceSettings | null) ?? {
      latitude: null,
      longitude: null,
      geofence_radius_meters: null,
      geofence_enabled: false,
      location_verification_required: false,
    };

  const sanitizedRadius = input.radiusMeters ? Math.round(input.radiusMeters) : null;
  if (sanitizedRadius && (sanitizedRadius < 100 || sanitizedRadius > 10000)) {
    throw new Error('Radius must be between 100m and 10,000m.');
  }

  const nextLatitude = input.geofenceEnabled ? input.latitude : null;
  const nextLongitude = input.geofenceEnabled ? input.longitude : null;
  const nextRadius = input.geofenceEnabled ? sanitizedRadius ?? before.geofence_radius_meters ?? 500 : null;

  if (input.geofenceEnabled) {
    if (nextLatitude === null || nextLongitude === null) {
      throw new Error('Latitude and longitude are required when enabling the geofence.');
    }
    if (!nextRadius) {
      throw new Error('Radius is required when enabling the geofence.');
    }
  }

  const payload = {
    latitude: nextLatitude,
    longitude: nextLongitude,
    geofence_radius_meters: nextRadius,
    geofence_enabled: input.geofenceEnabled,
    location_verification_required: input.geofenceEnabled,
  };

  await supabase.from('conventions').update(payload).eq('id', input.conventionId);

  await logAudit({
    actorId: profile.id,
    action: 'update_convention_geofence',
    entityType: 'convention',
    entityId: input.conventionId,
    diff: { before, after: payload },
  });

  revalidatePath('/conventions');
  revalidatePath(`/conventions/${input.conventionId}`);
  revalidatePath(`/conventions/${input.conventionId}/location`);
}
