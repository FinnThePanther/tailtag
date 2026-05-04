import { createServiceRoleClient } from '$lib/server/supabase/service';

export type ConventionAnalytics = {
  conventionId: string;
  totalCatches: number;
  catchesToday: number;
  pendingCatches: number;
};

export type CatchModeExperimentResult = {
  experimentKey: string;
  variant: string;
  assignedProfiles: number;
  exposedProfiles: number;
  defaultsApplied: number;
  currentAutoProfiles: number;
  currentManualProfiles: number;
  switchedAwayProfiles: number;
  switchAwayRate: number;
  fursuitsCreatedAfterExposure: number;
  catchesAfterExposure: number;
  acceptedCatchesAfterExposure: number;
  pendingCatchesAfterExposure: number;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

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

export async function fetchCatchModeExperimentResults(): Promise<CatchModeExperimentResult[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await (supabase as any)
    .from('catch_mode_default_experiment_results')
    .select(
      `
      experiment_key,
      variant,
      assigned_profiles,
      exposed_profiles,
      defaults_applied,
      current_auto_profiles,
      current_manual_profiles,
      switched_away_profiles,
      switch_away_rate,
      fursuits_created_after_exposure,
      catches_after_exposure,
      accepted_catches_after_exposure,
      pending_catches_after_exposure
    `,
    )
    .order('variant', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    experimentKey: String(row.experiment_key ?? 'catch_mode_default_v1'),
    variant: String(row.variant ?? ''),
    assignedProfiles: toNumber(row.assigned_profiles),
    exposedProfiles: toNumber(row.exposed_profiles),
    defaultsApplied: toNumber(row.defaults_applied),
    currentAutoProfiles: toNumber(row.current_auto_profiles),
    currentManualProfiles: toNumber(row.current_manual_profiles),
    switchedAwayProfiles: toNumber(row.switched_away_profiles),
    switchAwayRate: toNumber(row.switch_away_rate),
    fursuitsCreatedAfterExposure: toNumber(row.fursuits_created_after_exposure),
    catchesAfterExposure: toNumber(row.catches_after_exposure),
    acceptedCatchesAfterExposure: toNumber(row.accepted_catches_after_exposure),
    pendingCatchesAfterExposure: toNumber(row.pending_catches_after_exposure),
  }));
}
