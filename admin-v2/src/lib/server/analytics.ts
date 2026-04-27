import { createServiceRoleClient } from '$lib/server/supabase/service';

export type ConventionAnalytics = {
  conventionId: string;
  totalCatches: number;
  catchesToday: number;
  pendingCatches: number;
};

export async function fetchConventionAnalytics(conventionId: string): Promise<ConventionAnalytics> {
  const supabase = createServiceRoleClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [total, today, pending] = await Promise.all([
    supabase
      .from('catches')
      .select('id', { head: true, count: 'exact' })
      .eq('convention_id', conventionId),
    supabase
      .from('catches')
      .select('id', { head: true, count: 'exact' })
      .eq('convention_id', conventionId)
      .gte('caught_at', todayStart.toISOString()),
    supabase
      .from('catches')
      .select('id', { head: true, count: 'exact' })
      .eq('convention_id', conventionId)
      .eq('status', 'PENDING'),
  ]);

  return {
    conventionId,
    totalCatches: total.count ?? 0,
    catchesToday: today.count ?? 0,
    pendingCatches: pending.count ?? 0,
  };
}

export async function fetchAllConventionAnalytics(conventionIds: string[]) {
  return Promise.all(conventionIds.map((id) => fetchConventionAnalytics(id)));
}
