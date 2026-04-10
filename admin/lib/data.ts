import { createServiceRoleClient } from './supabase/service';
import type { AdminProfile } from './auth';
import type { Database } from '@/types/database';
import { resolveAdminMediaUrl } from './storage';

type PlayerSearchResult = {
  id: string;
  username: string | null;
  email: string | null;
  role: Database['public']['Enums']['user_role'];
  is_suspended: boolean;
  suspended_until: string | null;
  avatar_url: string | null;
  fursuit_count: number;
  catch_count: number;
  report_count: number;
  created_at: string;
};

type ConventionRow = Database['public']['Tables']['conventions']['Row'];

export async function fetchDashboardSummary() {
  const supabase = createServiceRoleClient();
  const [players, suspended, conventions, pendingReports] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_suspended', true),
    supabase.from('conventions').select('id', { count: 'exact', head: true }),
    supabase.from('user_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  return {
    totalPlayers: players.count ?? 0,
    suspendedPlayers: suspended.count ?? 0,
    activeConventions: conventions.count ?? 0,
    pendingReports: pendingReports.count ?? 0,
  };
}

export async function fetchPlayerSearch(params: {
  search?: string;
  role?: Database['public']['Enums']['user_role'] | null;
  conventionId?: string | null;
  isSuspended?: boolean | null;
  page?: number;
  pageSize?: number;
}) {
  const supabase = createServiceRoleClient();
  const pageSize = params.pageSize ?? 20;
  const offset = ((params.page ?? 1) - 1) * pageSize;

  const { data, error } = await (supabase as any).rpc('search_players', {
    search_term: params.search || null,
    role_filter: params.role || null,
    convention_filter: params.conventionId || null,
    is_suspended_filter: params.isSuspended ?? null,
    limit_count: pageSize,
    offset_count: offset,
  });

  if (error) {
    throw error;
  }

  return (data as PlayerSearchResult[]).map((row) => ({
    ...row,
    avatar_url: resolveAdminMediaUrl({
      bucket: 'profile-avatars',
      legacyUrl: row.avatar_url,
    }),
  }));
}

export async function fetchPlayerProfile(userId: string) {
  const supabase = createServiceRoleClient();

  const [{ data: profile }, { data: moderationSummary }, { data: actions }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, avatar_url, role, is_suspended, suspended_until, suspension_reason, created_at')
      .eq('id', userId)
      .single(),
    (supabase as any).rpc('get_user_moderation_summary', { p_user_id: userId }),
    supabase
      .from('user_moderation_actions')
      .select('id, action_type, scope, convention_id, reason, duration_hours, is_active, created_at, expires_at, revoked_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return {
    profile: profile
      ? {
          ...profile,
          avatar_url: resolveAdminMediaUrl({
            bucket: 'profile-avatars',
            legacyUrl: profile.avatar_url,
          }),
        }
      : null,
    moderationSummary,
    actions,
  };
}

export async function fetchConventions(): Promise<ConventionRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('conventions')
    .select(
      [
        'id',
        'name',
        'slug',
        'start_date',
        'end_date',
        'location',
        'timezone',
        'config',
        'latitude',
        'longitude',
        'geofence_radius_meters',
        'geofence_enabled',
        'location_verification_required',
      ].join(', ')
    )
    .order('start_date', { ascending: false });
  if (error) {
    throw error;
  }
  return ((data ?? []) as unknown) as ConventionRow[];
}

type EventStaffAssignment = {
  id: string;
  profile_id: string;
  role: string;
  status: string;
  assigned_at: string;
  notes: string | null;
  profiles?: { username?: string | null; avatar_url?: string | null; role?: string | null } | { username?: string | null; avatar_url?: string | null; role?: string | null }[];
};

export async function fetchConvention(conventionId: string): Promise<{
  convention: ConventionRow | null;
  staff: EventStaffAssignment[];
}> {
  const supabase = createServiceRoleClient();

  // TODO: Create event_staff table in database
  const { data: conventionData, error: conventionError } = await supabase
    .from('conventions')
    .select(
      [
        'id',
        'name',
        'slug',
        'start_date',
        'end_date',
        'location',
        'timezone',
        'config',
        'latitude',
        'longitude',
        'geofence_radius_meters',
        'geofence_enabled',
        'location_verification_required',
      ].join(', ')
    )
    .eq('id', conventionId)
    .single();

  if (conventionError && conventionError.code !== 'PGRST116') {
    throw conventionError;
  }

  const staffQuery = await supabase
    .from('event_staff')
    .select(
      'id, profile_id, role, status, assigned_at, notes, profiles:profile_id(username, avatar_url, role)'
    )
    .eq('convention_id', conventionId)
    .order('assigned_at', { ascending: false });

  const staff = ((staffQuery.data ?? []) as EventStaffAssignment[]).map((entry) => {
    const profile = Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles;
    if (!profile) {
      return entry;
    }

    return {
      ...entry,
      profiles: {
        ...profile,
        avatar_url: resolveAdminMediaUrl({
          bucket: 'profile-avatars',
          legacyUrl: profile.avatar_url ?? null,
        }),
      },
    } satisfies EventStaffAssignment;
  });

  const convention = (conventionData ?? null) as unknown as ConventionRow | null;

  return { convention, staff };
}

type UserBlockRow = {
  id: string;
  direction: 'blocked' | 'blocked_by';
  other_user_id: string;
  other_username: string | null;
  created_at: string;
};

export async function fetchUserBlocks(userId: string): Promise<UserBlockRow[]> {
  const supabase = createServiceRoleClient();

  const [{ data: blockedByUser }, { data: blockedByOthers }] = await Promise.all([
    supabase
      .from('user_blocks')
      .select('id, blocked_id, created_at, blocked:blocked_id(username)')
      .eq('blocker_id', userId),
    supabase
      .from('user_blocks')
      .select('id, blocker_id, created_at, blocker:blocker_id(username)')
      .eq('blocked_id', userId),
  ]);

  const results: UserBlockRow[] = [];

  for (const row of (blockedByUser ?? []) as any[]) {
    results.push({
      id: row.id,
      direction: 'blocked',
      other_user_id: row.blocked_id,
      other_username: row.blocked?.username ?? null,
      created_at: row.created_at,
    });
  }

  for (const row of (blockedByOthers ?? []) as any[]) {
    results.push({
      id: row.id,
      direction: 'blocked_by',
      other_user_id: row.blocker_id,
      other_username: row.blocker?.username ?? null,
      created_at: row.created_at,
    });
  }

  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return results;
}

export async function fetchAuditLogs(limit = 50) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, actor_id, action, entity_type, entity_id, created_at, context')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}

export function isOwner(profile: AdminProfile) {
  return profile.role === 'owner';
}

export async function fetchStaffAssignments() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('event_staff')
    .select(
      [
        'id',
        'role',
        'status',
        'assigned_at',
        'notes',
        'convention_id',
        'conventions(name)',
        'profile_id',
        'profiles:profile_id(username, role)',
        'assigned_by_user_id',
        'assigned_by:assigned_by_user_id(username)',
      ].join(', ')
    )
    .order('assigned_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as any;
}

type TagWithMeta = {
  id: string;
  nfc_uid: string | null;
  qr_token: string | null;
  qr_token_created_at: string | null;
  qr_asset_path: string | null;
  status: string;
  fursuit_id: string | null;
  registered_by_user_id: string;
  registered_at: string | null;
  linked_at: string | null;
  updated_at: string | null;
  fursuits?: { id: string; name: string | null } | null;
  profiles?: { username: string | null } | null;
  last_scan?: {
    scan_method: string;
    result: string;
    created_at: string;
  } | null;
};

export async function fetchTags(limit = 50): Promise<TagWithMeta[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('tags')
    .select(
      [
        'id',
        'nfc_uid',
        'qr_token',
        'qr_token_created_at',
        'qr_asset_path',
        'status',
        'fursuit_id',
        'registered_by_user_id',
        'registered_at',
        'linked_at',
        'updated_at',
        'fursuits(id, name)',
        'profiles:registered_by_user_id(username)',
      ].join(', ')
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const tags = (data ?? []) as unknown as TagWithMeta[];
  const tagIds = tags.map((tag) => tag.id);

  if (tagIds.length === 0) {
    return tags;
  }

  const { data: scanData, error: scanError } = await supabase
    .from('tag_scans')
    .select('tag_id, scan_method, result, created_at')
    .in('tag_id', tagIds)
    .order('created_at', { ascending: false });

  if (scanError) {
    throw scanError;
  }

  const scanMap = new Map<string, TagWithMeta['last_scan']>();
  for (const entry of scanData ?? []) {
    if (!entry.tag_id || scanMap.has(entry.tag_id)) {
      continue;
    }
    scanMap.set(entry.tag_id, {
      scan_method: entry.scan_method,
      result: entry.result,
      created_at: entry.created_at,
    });
  }

  return tags.map((tag) => ({
    ...tag,
    last_scan: scanMap.get(tag.id) ?? null,
  }));
}

export async function fetchTagActivity(tagId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('tag_scans')
    .select('scan_method, result, created_at, scanner_user_id')
    .eq('tag_id', tagId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchTagScanLogs(params: {
  tagId?: string | null;
  method?: 'nfc' | 'qr' | null;
  result?: string | null;
  identifier?: string | null;
  limit?: number;
}) {
  const supabase = createServiceRoleClient();
  const limit = params.limit ?? 100;

  const query = supabase
    .from('tag_scans')
    .select(
      [
        'id',
        'tag_id',
        'scanned_identifier',
        'scan_method',
        'result',
        'created_at',
        'metadata',
        'tags:tag_id(id, nfc_uid, qr_token, fursuit_id, fursuits(name))',
        'profiles:scanner_user_id(username)',
      ].join(', ')
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params.tagId) {
    query.eq('tag_id', params.tagId);
  }
  if (params.method) {
    query.eq('scan_method', params.method);
  }
  if (params.result) {
    query.eq('result', params.result);
  }
  if (params.identifier) {
    query.ilike('scanned_identifier', `%${params.identifier}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchReports(params: {
  status?: string | null;
  severity?: string | null;
  conventionId?: string | null;
  limit?: number;
}) {
  const supabase = createServiceRoleClient();
  const query = supabase
    .from('user_reports')
    .select(
      [
        'id',
        'report_type',
        'severity',
        'status',
        'description',
        'convention_id',
        'reporter_id',
        'reported_user_id',
        'reported_fursuit_id',
        'resolved_by_user_id',
        'resolved_at',
        'resolution_notes',
        'created_at',
        'profiles:reporter_id(username)',
        'reported:reported_user_id(username)',
      ].join(', ')
    )
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50);

  if (params.status) query.eq('status', params.status);
  if (params.severity) query.eq('severity', params.severity);
  if (params.conventionId) query.eq('convention_id', params.conventionId);

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data ?? []) as any;
}


export async function fetchAchievements() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('achievements')
    .select('id, key, name, description')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) {
    throw error;
  }
  return data ?? [];
}

export type ConventionTaskRow = {
  id: string;
  name: string;
  description: string;
  kind: string;
  requirement: number;
  is_active: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type ConventionAchievementRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  recipient_role: string;
  trigger_event: string;
  is_active: boolean;
  created_at: string;
  rule_id: string | null;
  rule_kind: string | null;
  rule: Record<string, unknown> | null;
};

export async function fetchConventionTasks(conventionId: string): Promise<ConventionTaskRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('daily_tasks')
    .select('id, name, description, kind, requirement, is_active, created_at, metadata')
    .eq('convention_id', conventionId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }
  return (data ?? []) as ConventionTaskRow[];
}

export async function fetchConventionAchievements(conventionId: string): Promise<ConventionAchievementRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('achievements')
    .select('id, key, name, description, category, recipient_role, trigger_event, is_active, created_at, rule_id, achievement_rules(kind, rule)')
    .eq('convention_id', conventionId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as any[]).map((row) => {
    const ruleRow = Array.isArray(row.achievement_rules)
      ? row.achievement_rules[0]
      : row.achievement_rules;
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      category: row.category,
      recipient_role: row.recipient_role,
      trigger_event: row.trigger_event,
      is_active: row.is_active,
      created_at: row.created_at,
      rule_id: row.rule_id ?? null,
      rule_kind: ruleRow?.kind ?? null,
      rule: ruleRow?.rule ?? null,
    } satisfies ConventionAchievementRow;
  });
}

export async function fetchAdminErrors(limit = 50) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('admin_error_log')
    .select('id, convention_id, error_type, error_message, severity, occurred_at, created_at')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }
  return data ?? [];
}
