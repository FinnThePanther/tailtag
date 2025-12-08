import { supabase } from '../../lib/supabase';
import { captureSupabaseError } from '../../lib/sentry';
import type { Database } from '../../types/database';

export type StaffPlayerResult = {
  id: string;
  username: string | null;
  email: string | null;
  role: Database['public']['Enums']['user_role'];
  is_suspended: boolean;
  fursuit_count: number;
  catch_count: number;
};

export async function searchPlayersForStaff(term: string): Promise<StaffPlayerResult[]> {
  const trimmed = term.trim();
  if (!trimmed) {
    return [];
  }

  const { data, error } = await supabase.rpc('search_players', {
    search_term: trimmed,
    limit_count: 10,
    offset_count: 0,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'staffMode.searchPlayersForStaff',
      action: 'rpc.search_players',
    });
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    username: row.username ?? null,
    email: row.email ?? null,
    role: row.role,
    is_suspended: row.is_suspended === true,
    fursuit_count: Number(row.fursuit_count ?? 0),
    catch_count: Number(row.catch_count ?? 0),
  }));
}
