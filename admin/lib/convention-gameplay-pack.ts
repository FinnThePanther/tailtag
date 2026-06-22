import { createServiceRoleClient } from './supabase/service';
import type { Database } from '@/types/database';

type ServiceClient = ReturnType<typeof createServiceRoleClient>;
type ConventionRow = Database['public']['Tables']['conventions']['Row'];

export type GameplayPackResult = {
  tasks: { created: number; existing: number };
  achievements: { created: number; existing: number };
};

export async function generateDefaultGameplayPack(
  conventionId: string,
  supabase = createServiceRoleClient(),
): Promise<GameplayPackResult> {
  await fetchGameplayPackConvention(supabase, conventionId);

  const [tasks, achievements] = await Promise.all([
    countGlobalTasks(supabase),
    countGlobalAchievements(supabase),
  ]);

  return {
    tasks,
    achievements,
  };
}

async function fetchGameplayPackConvention(supabase: ServiceClient, conventionId: string) {
  const { data, error } = await supabase
    .from('conventions')
    .select('id, name')
    .eq('id', conventionId)
    .single();

  if (error) throw error;
  if (!data) throw new Error('Convention not found.');

  return data as Pick<ConventionRow, 'id' | 'name'>;
}

async function countGlobalTasks(supabase: ServiceClient) {
  const { count, error } = await supabase
    .from('daily_tasks')
    .select('id', { count: 'exact', head: true })
    .is('convention_id', null)
    .eq('is_active', true);

  if (error) throw error;
  return { created: 0, existing: count ?? 0 };
}

async function countGlobalAchievements(supabase: ServiceClient) {
  const { count, error } = await supabase
    .from('achievements')
    .select('id', { count: 'exact', head: true })
    .is('convention_id', null)
    .eq('is_active', true);

  if (error) throw error;
  return { created: 0, existing: count ?? 0 };
}
