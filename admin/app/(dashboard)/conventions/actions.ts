'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';
import {
  ensureConventionDailies,
  fetchConventionReadiness,
  generateDefaultGameplayPack,
} from '@/lib/convention-lifecycle';

const CONFIG_ROLES = ['owner', 'organizer'] as const;
const CONTENT_ROLES = ['owner', 'organizer'] as const;

const DEFAULT_CONFIG = {
  cooldowns: { catch_seconds: 0 },
  points: { catch: 1 },
  feature_flags: { staff_mode: true },
};

function validateSlug(slug: string) {
  if (!slug.trim()) throw new Error('Slug is required.');
  if (!/^[a-z0-9-]+$/.test(slug))
    throw new Error('Slug must only contain lowercase letters, numbers, and hyphens.');
}

export async function createConventionAction(input: {
  name: string;
  slug: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  timezone: string;
  createDefaultGameplayPack: boolean;
  startImmediately: boolean;
}) {
  const { profile } = await assertAdminAction([...CONFIG_ROLES]);
  const supabase = createServiceRoleClient();

  if (!input.name.trim()) throw new Error('Convention name is required.');
  validateSlug(input.slug);

  const { data, error } = await supabase
    .from('conventions')
    .insert({
      name: input.name.trim(),
      slug: input.slug.trim(),
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      location: input.location?.trim() || null,
      timezone: input.timezone || 'UTC',
      config: DEFAULT_CONFIG,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error) throw error;

  await logAudit({
    actorId: profile.id,
    action: 'create_convention',
    entityType: 'convention',
    entityId: data.id,
    context: {
      name: input.name,
      slug: input.slug,
      create_default_gameplay_pack: input.createDefaultGameplayPack,
      start_immediately: input.startImmediately,
    },
  });

  let packResult = null;
  if (input.createDefaultGameplayPack) {
    packResult = await generateDefaultGameplayPack(data.id, supabase);
    await logAudit({
      actorId: profile.id,
      action: 'generate_convention_gameplay_pack',
      entityType: 'convention',
      entityId: data.id,
      context: { ...packResult, during_create: true },
    });
  }

  const readiness = await fetchConventionReadiness(data.id, supabase);
  let finalStatus = 'draft';
  let rotationResult = null;

  if (readiness.ready && readiness.dateState === 'before_window') {
    finalStatus = 'scheduled';
    const { error: statusError } = await supabase
      .from('conventions')
      .update({ status: finalStatus })
      .eq('id', data.id);
    if (statusError) throw statusError;
  } else if (readiness.ready && input.startImmediately && readiness.dateState === 'inside_window') {
    finalStatus = 'live';
    const { error: statusError } = await supabase
      .from('conventions')
      .update({ status: finalStatus, started_at: new Date().toISOString() })
      .eq('id', data.id);
    if (statusError) throw statusError;

    rotationResult = await ensureConventionDailies(data.id, profile.id);
    await logAudit({
      actorId: profile.id,
      action: 'rotate_convention_dailies',
      entityType: 'convention',
      entityId: data.id,
      context: { source: 'create_convention', result: rotationResult },
    });
  }

  if (finalStatus !== 'draft') {
    await logAudit({
      actorId: profile.id,
      action: 'update_convention_lifecycle',
      entityType: 'convention',
      entityId: data.id,
      context: {
        from: 'draft',
        to: finalStatus,
        readiness,
        pack_result: packResult,
      },
    });
  }

  redirect(`/conventions/${data.id}`);
}

export async function generateConventionGameplayPackAction(conventionId: string) {
  const { profile } = await assertAdminAction([...CONTENT_ROLES]);
  const supabase = createServiceRoleClient();

  const result = await generateDefaultGameplayPack(conventionId, supabase);

  await logAudit({
    actorId: profile.id,
    action: 'generate_convention_gameplay_pack',
    entityType: 'convention',
    entityId: conventionId,
    context: result,
  });

  revalidatePath(`/conventions/${conventionId}`);

  return result;
}

export async function runConventionReadinessCheckAction(conventionId: string) {
  const { profile } = await assertAdminAction([...CONFIG_ROLES]);
  const supabase = createServiceRoleClient();

  const readiness = await fetchConventionReadiness(conventionId, supabase);

  await logAudit({
    actorId: profile.id,
    action: 'run_convention_readiness_check',
    entityType: 'convention',
    entityId: conventionId,
    context: readiness,
  });

  revalidatePath(`/conventions/${conventionId}`);

  return readiness;
}

export async function startConventionAction(conventionId: string) {
  const { profile } = await assertAdminAction([...CONFIG_ROLES]);
  const supabase = createServiceRoleClient();

  const { data: current, error: currentError } = await supabase
    .from('conventions')
    .select('status, started_at')
    .eq('id', conventionId)
    .single();

  if (currentError) throw currentError;
  if (!current) throw new Error('Convention not found.');
  if (current.status === 'live') throw new Error('Convention is already live.');

  const readiness = await fetchConventionReadiness(conventionId, supabase);
  if (!readiness.ready) {
    throw new Error(readiness.blockingIssues.join(' '));
  }

  if (readiness.dateState === 'before_window') {
    const { error } = await supabase
      .from('conventions')
      .update({ status: 'scheduled' })
      .eq('id', conventionId);
    if (error) throw error;

    await logAudit({
      actorId: profile.id,
      action: 'update_convention_lifecycle',
      entityType: 'convention',
      entityId: conventionId,
      context: { from: current.status, to: 'scheduled', readiness },
    });

    revalidatePath('/conventions');
    revalidatePath(`/conventions/${conventionId}`);

    return { status: 'scheduled' as const, readiness };
  }

  if (readiness.dateState !== 'inside_window') {
    throw new Error('Convention can only be started inside its local date window.');
  }

  const { error } = await supabase
    .from('conventions')
    .update({
      status: 'live',
      started_at: current.started_at ?? new Date().toISOString(),
    })
    .eq('id', conventionId);
  if (error) throw error;

  const rotationResult = await ensureConventionDailies(conventionId, profile.id);

  await logAudit({
    actorId: profile.id,
    action: 'update_convention_lifecycle',
    entityType: 'convention',
    entityId: conventionId,
    context: { from: current.status, to: 'live', readiness },
  });

  await logAudit({
    actorId: profile.id,
    action: 'rotate_convention_dailies',
    entityType: 'convention',
    entityId: conventionId,
    context: { source: 'start_convention', result: rotationResult },
  });

  revalidatePath('/conventions');
  revalidatePath(`/conventions/${conventionId}`);

  return { status: 'live' as const, readiness, rotationResult };
}

export async function rotateConventionDailiesAction(conventionId: string) {
  const { profile } = await assertAdminAction([...CONTENT_ROLES]);

  const result = await ensureConventionDailies(conventionId, profile.id);

  await logAudit({
    actorId: profile.id,
    action: 'rotate_convention_dailies',
    entityType: 'convention',
    entityId: conventionId,
    context: { source: 'admin_detail', result },
  });

  revalidatePath(`/conventions/${conventionId}`);

  return result;
}

export async function updateConventionDetailsAction(input: {
  conventionId: string;
  name: string;
  slug: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  timezone: string;
}) {
  const { profile } = await assertAdminAction([...CONFIG_ROLES]);
  const supabase = createServiceRoleClient();

  if (!input.name.trim()) throw new Error('Convention name is required.');
  validateSlug(input.slug);

  const { data: current } = await supabase
    .from('conventions')
    .select('name, slug, start_date, end_date, location, timezone')
    .eq('id', input.conventionId)
    .single();

  const payload = {
    name: input.name.trim(),
    slug: input.slug.trim(),
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    location: input.location?.trim() || null,
    timezone: input.timezone || 'UTC',
  };

  const { error } = await supabase.from('conventions').update(payload).eq('id', input.conventionId);
  if (error) throw error;

  await logAudit({
    actorId: profile.id,
    action: 'update_convention_details',
    entityType: 'convention',
    entityId: input.conventionId,
    diff: { before: current, after: payload },
  });

  revalidatePath('/conventions');
  revalidatePath(`/conventions/${input.conventionId}`);
}

type ConventionConfig = {
  cooldowns?: { catch_seconds?: number | null };
  points?: { catch?: number | null };
  feature_flags?: { staff_mode?: boolean };
};

export async function updateConventionConfigAction(input: {
  conventionId: string;
  catchCooldownSeconds: number | null;
  catchPoints: number | null;
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
      ].join(', '),
    )
    .eq('id', input.conventionId)
    .single();

  const before: GeofenceSettings = (current as GeofenceSettings | null) ?? {
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
  const nextRadius = input.geofenceEnabled
    ? (sanitizedRadius ?? before.geofence_radius_meters ?? 500)
    : null;

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

// ─── Convention-scoped daily tasks ───────────────────────────────────────────

export async function createConventionTaskAction(input: {
  conventionId: string;
  name: string;
  description: string;
  kind: string;
  requirement: number;
  metadata?: Record<string, unknown> | null;
}) {
  const { profile } = await assertAdminAction([...CONTENT_ROLES]);
  const supabase = createServiceRoleClient();

  if (!input.name.trim()) throw new Error('Task name is required.');
  if (!input.kind.trim()) throw new Error('Task kind is required.');
  if (input.requirement < 1) throw new Error('Requirement must be at least 1.');

  const { data, error } = await supabase
    .from('daily_tasks')
    .insert({
      convention_id: input.conventionId,
      name: input.name.trim(),
      description: input.description.trim(),
      kind: input.kind,
      requirement: input.requirement,
      is_active: true,
      metadata: input.metadata ?? null,
    } as any)
    .select('id')
    .single();

  if (error) throw error;

  await logAudit({
    actorId: profile.id,
    action: 'create_convention_task',
    entityType: 'daily_tasks',
    entityId: data.id,
    context: { convention_id: input.conventionId, name: input.name },
  });

  revalidatePath(`/conventions/${input.conventionId}`);
}

export async function toggleConventionTaskAction(input: {
  taskId: string;
  isActive: boolean;
  conventionId: string;
}) {
  const { profile } = await assertAdminAction([...CONTENT_ROLES]);
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from('daily_tasks')
    .update({ is_active: input.isActive })
    .eq('id', input.taskId);

  if (error) throw error;

  await logAudit({
    actorId: profile.id,
    action: 'toggle_convention_task',
    entityType: 'daily_tasks',
    entityId: input.taskId,
    context: { convention_id: input.conventionId, is_active: input.isActive },
  });

  revalidatePath(`/conventions/${input.conventionId}`);
}

export async function updateConventionTaskAction(input: {
  taskId: string;
  conventionId: string;
  name: string;
  description: string;
  kind: string;
  requirement: number;
  metadata?: Record<string, unknown> | null;
}) {
  const { profile } = await assertAdminAction([...CONTENT_ROLES]);
  const supabase = createServiceRoleClient();

  if (!input.name.trim()) throw new Error('Task name is required.');
  if (!input.kind.trim()) throw new Error('Task kind is required.');
  if (input.requirement < 1) throw new Error('Requirement must be at least 1.');

  const { error } = await supabase
    .from('daily_tasks')
    .update({
      name: input.name.trim(),
      description: input.description.trim(),
      kind: input.kind,
      requirement: input.requirement,
      metadata: input.metadata ?? null,
    } as any)
    .eq('id', input.taskId);

  if (error) throw error;

  await logAudit({
    actorId: profile.id,
    action: 'update_convention_task',
    entityType: 'daily_tasks',
    entityId: input.taskId,
    context: { convention_id: input.conventionId, name: input.name },
  });

  revalidatePath(`/conventions/${input.conventionId}`);
}

export async function deleteConventionTaskAction(input: { taskId: string; conventionId: string }) {
  const { profile } = await assertAdminAction([...CONTENT_ROLES]);
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from('daily_tasks').delete().eq('id', input.taskId);

  if (error) throw error;

  await logAudit({
    actorId: profile.id,
    action: 'delete_convention_task',
    entityType: 'daily_tasks',
    entityId: input.taskId,
    context: { convention_id: input.conventionId },
  });

  revalidatePath(`/conventions/${input.conventionId}`);
}

// ─── Convention-scoped achievements ──────────────────────────────────────────

const KIND_META: Record<string, { triggerEvent: string; recipientRole: string }> = {
  fursuit_caught_count_at_convention: {
    triggerEvent: 'catch_performed',
    recipientRole: 'fursuit_owner',
  },
  convention_joined: {
    triggerEvent: 'convention_joined',
    recipientRole: 'any',
  },
};

export async function createConventionAchievementAction(input: {
  conventionId: string;
  key: string;
  name: string;
  description: string;
  category: string;
  kind: string;
  rule?: Record<string, unknown>;
}) {
  const { profile } = await assertAdminAction([...CONTENT_ROLES]);
  const supabase = createServiceRoleClient();

  if (!input.key.trim()) throw new Error('Achievement key is required.');
  if (!input.name.trim()) throw new Error('Achievement name is required.');
  if (!input.kind) throw new Error('Rule kind is required.');

  const meta = KIND_META[input.kind];
  if (!meta) throw new Error(`Unsupported rule kind: ${input.kind}`);

  const rule = input.rule ?? {};

  const slug = `convention-${input.conventionId.slice(0, 8)}-${input.key.toLowerCase()}`;

  // Insert rule first
  const { data: ruleData, error: ruleError } = await supabase
    .from('achievement_rules')
    .insert({
      kind: input.kind,
      name: input.name.trim(),
      slug,
      rule: rule as any,
      is_active: true,
    })
    .select('rule_id')
    .single();

  if (ruleError) throw ruleError;

  // Insert achievement
  const { data: achData, error: achError } = await supabase
    .from('achievements')
    .insert({
      convention_id: input.conventionId,
      key: input.key.trim(),
      name: input.name.trim(),
      description: input.description.trim(),
      category: input.category as any,
      recipient_role: meta.recipientRole as any,
      trigger_event: meta.triggerEvent as any,
      is_active: true,
      rule_id: ruleData.rule_id,
    } as any)
    .select('id')
    .single();

  if (achError) {
    // Best-effort cleanup of orphaned rule
    await supabase.from('achievement_rules').delete().eq('rule_id', ruleData.rule_id);
    throw achError;
  }

  await logAudit({
    actorId: profile.id,
    action: 'create_convention_achievement',
    entityType: 'achievements',
    entityId: achData.id,
    context: { convention_id: input.conventionId, key: input.key, kind: input.kind },
  });

  revalidatePath(`/conventions/${input.conventionId}`);
}

export async function toggleConventionAchievementAction(input: {
  achievementId: string;
  isActive: boolean;
  conventionId: string;
}) {
  const { profile } = await assertAdminAction([...CONTENT_ROLES]);
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from('achievements')
    .update({ is_active: input.isActive })
    .eq('id', input.achievementId);

  if (error) throw error;

  await logAudit({
    actorId: profile.id,
    action: 'toggle_convention_achievement',
    entityType: 'achievements',
    entityId: input.achievementId,
    context: { convention_id: input.conventionId, is_active: input.isActive },
  });

  revalidatePath(`/conventions/${input.conventionId}`);
}

export async function updateConventionAchievementAction(input: {
  achievementId: string;
  conventionId: string;
  name: string;
  description: string;
  category: string;
  kind: string;
  rule?: Record<string, unknown>;
  ruleId: string | null;
}) {
  const { profile } = await assertAdminAction([...CONTENT_ROLES]);
  const supabase = createServiceRoleClient();

  if (!input.name.trim()) throw new Error('Achievement name is required.');
  if (!input.kind) throw new Error('Rule kind is required.');

  const meta = KIND_META[input.kind];
  if (!meta) throw new Error(`Unsupported rule kind: ${input.kind}`);

  const rule = input.rule ?? {};

  const { error: achError } = await supabase
    .from('achievements')
    .update({
      name: input.name.trim(),
      description: input.description.trim(),
      category: input.category as any,
      recipient_role: meta.recipientRole as any,
      trigger_event: meta.triggerEvent as any,
    } as any)
    .eq('id', input.achievementId);

  if (achError) throw achError;

  if (input.ruleId) {
    const { error: ruleError } = await supabase
      .from('achievement_rules')
      .update({ kind: input.kind, rule: rule as any })
      .eq('rule_id', input.ruleId);

    if (ruleError) throw ruleError;
  }

  await logAudit({
    actorId: profile.id,
    action: 'update_convention_achievement',
    entityType: 'achievements',
    entityId: input.achievementId,
    context: { convention_id: input.conventionId, name: input.name, kind: input.kind },
  });

  revalidatePath(`/conventions/${input.conventionId}`);
}

export async function deleteConventionAchievementAction(input: {
  achievementId: string;
  conventionId: string;
  ruleId: string | null;
}) {
  const { profile } = await assertAdminAction([...CONTENT_ROLES]);
  const supabase = createServiceRoleClient();

  const { error: achError } = await supabase
    .from('achievements')
    .delete()
    .eq('id', input.achievementId);

  if (achError) throw achError;

  if (input.ruleId) {
    await supabase.from('achievement_rules').delete().eq('rule_id', input.ruleId);
  }

  await logAudit({
    actorId: profile.id,
    action: 'delete_convention_achievement',
    entityType: 'achievements',
    entityId: input.achievementId,
    context: { convention_id: input.conventionId },
  });

  revalidatePath(`/conventions/${input.conventionId}`);
}
