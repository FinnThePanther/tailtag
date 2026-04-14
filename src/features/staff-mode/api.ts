import { supabase } from '../../lib/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../lib/runtimeConfig';

type UserRole = 'player' | 'staff' | 'moderator' | 'organizer' | 'owner';

type StaffModerateParams = {
  action: 'ban' | 'unban';
  userId: string;
  reason: string;
  durationHours?: number | null;
  scope?: 'global' | 'event';
  conventionId?: string | null;
};

export type StaffPlayerResult = {
  id: string;
  username: string | null;
  email: string | null;
  role: UserRole;
  is_suspended: boolean;
  fursuit_count: number;
  catch_count: number;
};

export async function searchPlayersForStaff(term: string): Promise<StaffPlayerResult[]> {
  const trimmed = term.trim();
  if (!trimmed) {
    return [];
  }

  const { data, error } = await (supabase as any).rpc('search_players', {
    search_term: trimmed,
    limit_count: 10,
    offset_count: 0,
  });

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    username: row.username ?? null,
    email: row.email ?? null,
    role: row.role as UserRole,
    is_suspended: row.is_suspended === true,
    fursuit_count: Number(row.fursuit_count ?? 0),
    catch_count: Number(row.catch_count ?? 0),
  }));
}

export async function staffModerate(params: StaffModerateParams): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const supabaseUrl = SUPABASE_URL;
  const supabaseKey = SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/staff-moderate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Moderation action failed (${response.status})`);
  }
}
