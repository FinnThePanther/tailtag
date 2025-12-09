import { createServiceRoleClient } from './supabase/service';
import type { AdminProfile } from './auth';
import type { Database } from '@/types/database';

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

  const { data, error } = await supabase.rpc('search_players', {
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

  return data as PlayerSearchResult[];
}

export async function fetchPlayerProfile(userId: string) {
  const supabase = createServiceRoleClient();

  const [{ data: profile }, { data: moderationSummary }, { data: actions }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, avatar_url, role, is_suspended, suspended_until, suspension_reason, created_at')
      .eq('id', userId)
      .single(),
    supabase.rpc('get_user_moderation_summary', { p_user_id: userId }),
    supabase
      .from('user_moderation_actions')
      .select('id, action_type, scope, convention_id, reason, duration_hours, is_active, created_at, expires_at, revoked_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return { profile, moderationSummary, actions };
}

export async function fetchConventions() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('conventions')
    .select('id, name, slug, start_date, end_date, location, config')
    .order('start_date', { ascending: false });
  if (error) {
    throw error;
  }
  return data;
}

export async function fetchConvention(conventionId: string) {
  const supabase = createServiceRoleClient();
  const [{ data: convention }, { data: staff }] = await Promise.all([
    supabase
      .from('conventions')
      .select('id, name, slug, start_date, end_date, location, config')
      .eq('id', conventionId)
      .single(),
    supabase
      .from('event_staff')
      .select(
        'id, profile_id, role, status, assigned_at, notes, profiles:profile_id(username, avatar_url, role)'
      )
      .eq('convention_id', conventionId)
      .order('assigned_at', { ascending: false }),
  ]);

  return { convention, staff };
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
  return data;
}

export async function fetchTags(limit = 50) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('nfc_tags')
    .select(
      [
        'uid',
        'status',
        'fursuit_id',
        'registered_by_user_id',
        'registered_at',
        'linked_at',
        'updated_at',
        'fursuits(name)',
        'profiles:registered_by_user_id(username)',
      ].join(', ')
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchTagActivity(uid: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('tag_activity')
    .select('seen_at, convention_id, catcher_id')
    .eq('tag_uid', uid)
    .order('seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
