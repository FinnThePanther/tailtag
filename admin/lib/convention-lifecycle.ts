import { createServiceRoleClient } from './supabase/service';
import type { Database } from '@/types/database';

export { generateDefaultGameplayPack, type GameplayPackResult } from './convention-gameplay-pack';
export {
  closeOutConvention,
  ensureConventionDailies,
  type ConventionCloseoutResult,
  type ConventionCloseoutSource,
  type ConventionDailiesSource,
} from './convention-operations';

type ServiceClient = ReturnType<typeof createServiceRoleClient>;
type ConventionRow = Database['public']['Tables']['conventions']['Row'];

export type ConventionDateState =
  | 'before_window'
  | 'inside_window'
  | 'after_window'
  | 'missing_dates';

export type ConventionReadinessResult = {
  ready: boolean;
  canSchedule: boolean;
  canStart: boolean;
  blockingIssues: string[];
  warnings: string[];
  localDay: string;
  dateState: ConventionDateState;
  status: string;
  counts: {
    activeRotationTasks: number;
    conventionTasks: number;
    conventionAchievements: number;
    todayAssignments: number;
  };
};

export type ConventionLifecycleHealthSeverity = 'healthy' | 'info' | 'warning' | 'critical';

export type ConventionLifecycleRecommendedAction =
  | 'none'
  | 'start_manually'
  | 'close_and_archive'
  | 'retry_closeout'
  | 'regenerate_recaps'
  | 'review_dates'
  | 'rotate_dailies';

export type ConventionLifecycleDiagnostics = {
  activeRotationTasks: number;
  todayAssignments: number;
  acceptedConventionCatches: number;
  pendingConventionCatches: number;
  activeProfileMemberships: number;
  activeFursuitAssignments: number;
  participantRecaps: number;
  archivedAt: string | null;
  closedAt: string | null;
  closeoutError: string | null;
  lastAutomationAttemptAt: string | null;
  lastAutomationSource: string | null;
  automationRetryAttemptsLast7Days: number;
  automationEligibleForAutoClose: boolean;
  automationEligibleForRetry: boolean;
};

export type ConventionLifecycleHealthResult = {
  status: string;
  severity: ConventionLifecycleHealthSeverity;
  warnings: string[];
  recommendedAction: ConventionLifecycleRecommendedAction;
  diagnostics: ConventionLifecycleDiagnostics;
  localDay: string;
  dateState: ConventionDateState;
};

type LifecycleHealthCountsRow = {
  convention_id: string;
  convention_tasks_count: number | string | null;
  today_assignments_count: number | string | null;
  accepted_convention_catches_count: number | string | null;
  pending_convention_catches_count: number | string | null;
  active_profile_memberships_count: number | string | null;
  active_fursuit_assignments_count: number | string | null;
  participant_recaps_count: number | string | null;
  last_automation_attempt_at: string | null;
  last_automation_source: string | null;
  automation_retry_attempts_last_7_days: number | string | null;
  recent_cron_close_attempt: boolean | null;
  recent_cron_retry_attempt: boolean | null;
};

const CLOSED_STATUSES = new Set(['closed', 'archived', 'canceled']);

export function getConventionLocalDay(timezone: string | null | undefined, now = new Date()) {
  const timeZone = timezone?.trim() || 'UTC';
  try {
    return formatLocalDay(timeZone, now);
  } catch {
    return formatLocalDay('UTC', now);
  }
}

export function getConventionLocalClock(timezone: string | null | undefined, now = new Date()) {
  const timeZone = timezone?.trim() || 'UTC';
  try {
    return formatLocalClock(timeZone, now);
  } catch {
    return formatLocalClock('UTC', now);
  }
}

export function getConventionDateState(
  convention: Pick<ConventionRow, 'start_date' | 'end_date'>,
  localDay: string,
): ConventionDateState {
  if (!convention.start_date || !convention.end_date) return 'missing_dates';
  if (localDay < convention.start_date) return 'before_window';
  if (localDay > convention.end_date) return 'after_window';
  return 'inside_window';
}

export async function fetchConventionReadiness(
  conventionId: string,
  supabase = createServiceRoleClient(),
): Promise<ConventionReadinessResult> {
  const convention = await fetchLifecycleConvention(supabase, conventionId);
  const localDay = getConventionLocalDay(convention.timezone);
  const dateState = getConventionDateState(convention, localDay);

  const [
    { count: activeRotationTasks, error: rotationError },
    { count: conventionTasks, error: taskError },
    { count: conventionAchievements, error: achievementError },
    { count: todayAssignments, error: assignmentError },
  ] = await Promise.all([
    supabase
      .from('daily_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or(`convention_id.is.null,convention_id.eq.${conventionId}`),
    supabase
      .from('daily_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('convention_id', conventionId),
    supabase
      .from('achievements')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('convention_id', conventionId),
    supabase
      .from('daily_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('convention_id', conventionId)
      .eq('day', localDay),
  ]);

  if (rotationError) throw rotationError;
  if (taskError) throw taskError;
  if (achievementError) throw achievementError;
  if (assignmentError) throw assignmentError;

  const counts = {
    activeRotationTasks: activeRotationTasks ?? 0,
    conventionTasks: conventionTasks ?? 0,
    conventionAchievements: conventionAchievements ?? 0,
    todayAssignments: todayAssignments ?? 0,
  };

  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (!convention.name.trim()) blockingIssues.push('Convention name is required.');
  if (!convention.slug.trim()) blockingIssues.push('Convention slug is required.');
  if (!convention.timezone.trim()) blockingIssues.push('Convention timezone is required.');
  if (!convention.start_date) blockingIssues.push('Start date is required.');
  if (!convention.end_date) blockingIssues.push('End date is required.');
  if (convention.start_date && convention.end_date && convention.end_date < convention.start_date) {
    blockingIssues.push('End date must be on or after the start date.');
  }
  if (CLOSED_STATUSES.has(convention.status)) {
    blockingIssues.push(`Convention status is ${convention.status}; it cannot be started.`);
  }
  if (dateState === 'after_window') {
    blockingIssues.push('The local convention date window has already ended.');
  }
  if (counts.activeRotationTasks < 3) {
    blockingIssues.push('At least three active daily tasks must be available for rotation.');
  }
  if (
    (convention.geofence_enabled || convention.location_verification_required) &&
    (convention.latitude === null ||
      convention.longitude === null ||
      convention.geofence_radius_meters === null)
  ) {
    blockingIssues.push('Enabled geofence requires latitude, longitude, and radius.');
  }

  if (counts.conventionTasks < 3) {
    warnings.push('Fewer than three convention-scoped daily tasks are active.');
  }
  if (counts.conventionAchievements === 0) {
    warnings.push('No convention achievements are active.');
  }
  if (dateState === 'before_window') {
    warnings.push('Convention is scheduled for a future local date.');
  }
  if (convention.status === 'scheduled' && dateState === 'inside_window') {
    warnings.push('Ready to start manually.');
  }

  const ready = blockingIssues.length === 0;

  return {
    ready,
    canSchedule: ready && dateState === 'before_window' && convention.status !== 'live',
    canStart: ready && dateState === 'inside_window' && convention.status !== 'live',
    blockingIssues,
    warnings,
    localDay,
    dateState,
    status: convention.status,
    counts,
  };
}

export async function fetchConventionLifecycleHealth(
  conventionId: string,
  supabase = createServiceRoleClient(),
): Promise<ConventionLifecycleHealthResult> {
  const convention = await fetchLifecycleConvention(supabase, conventionId);
  return buildConventionLifecycleHealth(convention, supabase);
}

export async function buildConventionLifecycleHealthList(
  conventions: Array<
    Pick<
      ConventionRow,
      | 'id'
      | 'status'
      | 'start_date'
      | 'end_date'
      | 'timezone'
      | 'closed_at'
      | 'archived_at'
      | 'closeout_error'
    >
  >,
  supabase = createServiceRoleClient(),
): Promise<Map<string, ConventionLifecycleHealthResult>> {
  if (conventions.length === 0) return new Map();

  const conventionIds = conventions.map((convention) => convention.id);
  const localDays = new Map(
    conventions.map((convention) => [convention.id, getConventionLocalDay(convention.timezone)]),
  );
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const localDaysByConvention = Object.fromEntries(localDays);

  const [{ count: globalActiveTasks, error: globalTaskError }, { data: healthCounts, error }] =
    await Promise.all([
      supabase
        .from('daily_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .is('convention_id', null),
      (supabase as any).rpc('get_convention_lifecycle_health_counts', {
        p_convention_ids: conventionIds,
        p_local_days: localDaysByConvention,
        p_retry_window_start: sevenDaysAgo,
        p_throttle_window_start: sixHoursAgo,
      }),
    ]);

  if (globalTaskError) throw globalTaskError;
  if (error) throw error;

  const healthCountsByConvention = new Map(
    ((healthCounts ?? []) as LifecycleHealthCountsRow[]).map((row) => [row.convention_id, row]),
  );

  const healthByConvention = new Map<string, ConventionLifecycleHealthResult>();
  for (const convention of conventions) {
    const localDay = localDays.get(convention.id) ?? getConventionLocalDay(convention.timezone);
    const localClock = getConventionLocalClock(convention.timezone);
    const dateState = getConventionDateState(convention, localDay);
    const counts = healthCountsByConvention.get(convention.id);
    const retryAttemptsLast7Days = numberFromCount(counts?.automation_retry_attempts_last_7_days);
    const diagnostics = createLifecycleDiagnostics(convention, {
      activeRotationTasks:
        (globalActiveTasks ?? 0) + numberFromCount(counts?.convention_tasks_count),
      todayAssignments: numberFromCount(counts?.today_assignments_count),
      acceptedConventionCatches: numberFromCount(counts?.accepted_convention_catches_count),
      pendingConventionCatches: numberFromCount(counts?.pending_convention_catches_count),
      activeProfileMemberships: numberFromCount(counts?.active_profile_memberships_count),
      activeFursuitAssignments: numberFromCount(counts?.active_fursuit_assignments_count),
      participantRecaps: numberFromCount(counts?.participant_recaps_count),
      lastAutomationAttemptAt: counts?.last_automation_attempt_at ?? null,
      lastAutomationSource: counts?.last_automation_source ?? null,
      automationRetryAttemptsLast7Days: retryAttemptsLast7Days,
    });

    healthByConvention.set(
      convention.id,
      buildLifecycleHealthResult({
        convention,
        diagnostics,
        localDay,
        localClock,
        dateState,
        retryAttemptsLast7Days,
        recentCronCloseAttempt: Boolean(counts?.recent_cron_close_attempt),
        recentCronRetryAttempt: Boolean(counts?.recent_cron_retry_attempt),
      }),
    );
  }

  return healthByConvention;
}

export async function buildConventionLifecycleHealth(
  convention: Pick<
    ConventionRow,
    | 'id'
    | 'status'
    | 'start_date'
    | 'end_date'
    | 'timezone'
    | 'closed_at'
    | 'archived_at'
    | 'closeout_error'
  >,
  supabase = createServiceRoleClient(),
): Promise<ConventionLifecycleHealthResult> {
  const localDay = getConventionLocalDay(convention.timezone);
  const localClock = getConventionLocalClock(convention.timezone);
  const dateState = getConventionDateState(convention, localDay);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const [
    { count: activeRotationTasks, error: rotationError },
    { count: todayAssignments, error: assignmentError },
    { count: acceptedConventionCatches, error: acceptedError },
    { count: pendingConventionCatches, error: pendingError },
    { count: activeProfileMemberships, error: membershipError },
    { count: activeFursuitAssignments, error: fursuitError },
    { count: participantRecaps, error: recapError },
    { data: auditRows, error: auditError },
  ] = await Promise.all([
    supabase
      .from('daily_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or(`convention_id.is.null,convention_id.eq.${convention.id}`),
    supabase
      .from('daily_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('convention_id', convention.id)
      .eq('day', localDay),
    supabase
      .from('catches')
      .select('id', { count: 'exact', head: true })
      .eq('convention_id', convention.id)
      .eq('status', 'ACCEPTED')
      .eq('is_tutorial', false),
    supabase
      .from('catches')
      .select('id', { count: 'exact', head: true })
      .eq('convention_id', convention.id)
      .eq('status', 'PENDING'),
    supabase
      .from('profile_conventions')
      .select('profile_id', { count: 'exact', head: true })
      .eq('convention_id', convention.id),
    supabase
      .from('fursuit_conventions')
      .select('fursuit_id', { count: 'exact', head: true })
      .eq('convention_id', convention.id),
    supabase
      .from('convention_participant_recaps')
      .select('id', { count: 'exact', head: true })
      .eq('convention_id', convention.id),
    supabase
      .from('audit_log')
      .select('action, context, created_at')
      .eq('entity_type', 'convention')
      .eq('entity_id', convention.id)
      .in('action', ['close_convention_attempt', 'close_convention_noop'])
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (rotationError) throw rotationError;
  if (assignmentError) throw assignmentError;
  if (acceptedError) throw acceptedError;
  if (pendingError) throw pendingError;
  if (membershipError) throw membershipError;
  if (fursuitError) throw fursuitError;
  if (recapError) throw recapError;
  if (auditError) throw auditError;

  const automation = getAutomationAuditSummary(auditRows ?? [], sevenDaysAgo, sixHoursAgo);
  const diagnostics = createLifecycleDiagnostics(convention, {
    activeRotationTasks: activeRotationTasks ?? 0,
    todayAssignments: todayAssignments ?? 0,
    acceptedConventionCatches: acceptedConventionCatches ?? 0,
    pendingConventionCatches: pendingConventionCatches ?? 0,
    activeProfileMemberships: activeProfileMemberships ?? 0,
    activeFursuitAssignments: activeFursuitAssignments ?? 0,
    participantRecaps: participantRecaps ?? 0,
    lastAutomationAttemptAt: automation.lastAutomationAttemptAt,
    lastAutomationSource: automation.lastAutomationSource,
    automationRetryAttemptsLast7Days: automation.retryAttemptsLast7Days,
  });

  return buildLifecycleHealthResult({
    convention,
    diagnostics,
    localDay,
    localClock,
    dateState,
    retryAttemptsLast7Days: automation.retryAttemptsLast7Days,
    recentCronCloseAttempt: automation.recentCronCloseAttempt,
    recentCronRetryAttempt: automation.recentCronRetryAttempt,
  });
}

function buildLifecycleHealthResult({
  convention,
  diagnostics,
  localDay,
  localClock,
  dateState,
  retryAttemptsLast7Days,
  recentCronCloseAttempt,
  recentCronRetryAttempt,
}: {
  convention: Pick<
    ConventionRow,
    | 'id'
    | 'status'
    | 'start_date'
    | 'end_date'
    | 'timezone'
    | 'closed_at'
    | 'archived_at'
    | 'closeout_error'
  >;
  diagnostics: ConventionLifecycleDiagnostics;
  localDay: string;
  localClock: { hour: number; minute: number };
  dateState: ConventionDateState;
  retryAttemptsLast7Days: number;
  recentCronCloseAttempt: boolean;
  recentCronRetryAttempt: boolean;
}): ConventionLifecycleHealthResult {
  const automationEligibleForAutoClose =
    convention.status === 'live' &&
    dateState === 'after_window' &&
    localClock.hour >= 6 &&
    !recentCronCloseAttempt;
  const automationEligibleForRetry =
    convention.status === 'closed' &&
    (convention.closeout_error !== null || convention.archived_at === null) &&
    retryAttemptsLast7Days < 5 &&
    !recentCronRetryAttempt;

  diagnostics.automationEligibleForAutoClose = automationEligibleForAutoClose;
  diagnostics.automationEligibleForRetry = automationEligibleForRetry;

  const warnings: string[] = [];
  let severity: ConventionLifecycleHealthSeverity = 'healthy';
  let recommendedAction: ConventionLifecycleRecommendedAction = 'none';

  const addWarning = (
    warning: string,
    nextAction: ConventionLifecycleRecommendedAction,
    nextSeverity: ConventionLifecycleHealthSeverity = 'warning',
  ) => {
    warnings.push(warning);
    const nextSeverityRank = severityRank(nextSeverity);
    const currentSeverityRank = severityRank(severity);
    // Break same-severity ties with an explicit action priority instead of relying on call order.
    if (
      nextSeverityRank > currentSeverityRank ||
      (nextSeverityRank === currentSeverityRank &&
        recommendedActionRank(nextAction) > recommendedActionRank(recommendedAction))
    ) {
      severity = nextSeverity;
      recommendedAction = nextAction;
    }
  };

  if (convention.status === 'live') {
    if (dateState === 'after_window') {
      if (automationEligibleForAutoClose) {
        addWarning(
          'The local convention date window has ended. Auto-close scheduled.',
          'none',
          'info',
        );
      } else if (localClock.hour < 6) {
        addWarning(
          'The local convention date window has ended. Auto-close pending.',
          'none',
          'info',
        );
      } else {
        addWarning(
          'The local convention date window has ended. Close and archive it manually if automation does not finish.',
          'close_and_archive',
          'warning',
        );
      }
    } else if (dateState === 'inside_window' && diagnostics.todayAssignments === 0) {
      addWarning("Today's daily tasks have not been rotated.", 'rotate_dailies', 'warning');
    }

    if (diagnostics.activeRotationTasks < 3) {
      addWarning(
        'Fewer than three active daily tasks are available for rotation.',
        'rotate_dailies',
        'warning',
      );
    }
  }

  if (convention.status === 'scheduled') {
    if (dateState === 'inside_window') {
      addWarning('Ready to start manually.', 'start_manually', 'info');
    } else if (dateState === 'after_window') {
      addWarning(
        'The scheduled date window has passed. Review dates or cancel this convention.',
        'review_dates',
        'warning',
      );
    }
  }

  if (convention.status === 'closed') {
    if (retryAttemptsLast7Days >= 5) {
      addWarning(
        'Manual retry required. Automation hit the retry cap.',
        'retry_closeout',
        'critical',
      );
    } else if (automationEligibleForRetry) {
      addWarning('Auto-retry scheduled.', 'retry_closeout', 'warning');
    } else {
      addWarning(
        diagnostics.closeoutError
          ? 'Closeout failed. Auto-retry is throttled.'
          : 'Closeout appears interrupted. Auto-retry is throttled.',
        'retry_closeout',
        diagnostics.closeoutError ? 'critical' : 'warning',
      );
    }
  }

  if (
    convention.status === 'archived' &&
    diagnostics.acceptedConventionCatches > 0 &&
    diagnostics.participantRecaps === 0
  ) {
    addWarning(
      'This archived convention has activity but no participant recaps. Regenerate recaps.',
      'regenerate_recaps',
      'critical',
    );
  }

  return {
    status: convention.status,
    severity,
    warnings,
    recommendedAction,
    diagnostics,
    localDay,
    dateState,
  };
}

function createLifecycleDiagnostics(
  convention: Pick<ConventionRow, 'closed_at' | 'archived_at' | 'closeout_error'>,
  overrides: Partial<ConventionLifecycleDiagnostics>,
): ConventionLifecycleDiagnostics {
  return {
    activeRotationTasks: 0,
    todayAssignments: 0,
    acceptedConventionCatches: 0,
    pendingConventionCatches: 0,
    activeProfileMemberships: 0,
    activeFursuitAssignments: 0,
    participantRecaps: 0,
    archivedAt: convention.archived_at ?? null,
    closedAt: convention.closed_at ?? null,
    closeoutError: convention.closeout_error ?? null,
    lastAutomationAttemptAt: null,
    lastAutomationSource: null,
    automationRetryAttemptsLast7Days: 0,
    automationEligibleForAutoClose: false,
    automationEligibleForRetry: false,
    ...overrides,
  };
}

function numberFromCount(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function getAutomationAuditSummary<
  T extends {
    action: string;
    context: unknown;
    created_at: string;
  },
>(auditRows: T[], sevenDaysAgo: string, sixHoursAgo: string) {
  const automationAuditRows = auditRows.filter((row) => {
    const context = row.context as Record<string, unknown> | null;
    return context?.source === 'cron_close' || context?.source === 'cron_retry';
  });
  const lastAutomationAttempt = automationAuditRows[0] ?? null;
  const lastCronCloseAttempt = automationAuditRows.find((row) => {
    const context = row.context as Record<string, unknown> | null;
    return row.action === 'close_convention_attempt' && context?.source === 'cron_close';
  });
  const lastCronRetryAttempt = automationAuditRows.find((row) => {
    const context = row.context as Record<string, unknown> | null;
    return row.action === 'close_convention_attempt' && context?.source === 'cron_retry';
  });
  const retryAttemptsLast7Days = automationAuditRows.filter((row) => {
    const context = row.context as Record<string, unknown> | null;
    return (
      row.action === 'close_convention_attempt' &&
      context?.source === 'cron_retry' &&
      row.created_at >= sevenDaysAgo
    );
  }).length;

  return {
    lastAutomationAttemptAt: lastAutomationAttempt?.created_at ?? null,
    lastAutomationSource:
      ((lastAutomationAttempt?.context as Record<string, unknown> | null)?.source as string) ??
      null,
    retryAttemptsLast7Days,
    recentCronCloseAttempt:
      Boolean(lastCronCloseAttempt?.created_at) && lastCronCloseAttempt!.created_at >= sixHoursAgo,
    recentCronRetryAttempt:
      Boolean(lastCronRetryAttempt?.created_at) && lastCronRetryAttempt!.created_at >= sixHoursAgo,
  };
}

async function fetchLifecycleConvention(supabase: ServiceClient, conventionId: string) {
  const { data, error } = await supabase
    .from('conventions')
    .select(
      [
        'id',
        'name',
        'slug',
        'status',
        'start_date',
        'end_date',
        'timezone',
        'closed_at',
        'archived_at',
        'closeout_error',
        'latitude',
        'longitude',
        'geofence_radius_meters',
        'geofence_enabled',
        'location_verification_required',
      ].join(', '),
    )
    .eq('id', conventionId)
    .single();

  if (error) throw error;
  if (!data) throw new Error('Convention not found.');

  return data as unknown as ConventionRow;
}

function formatLocalDay(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Could not resolve local day for ${timeZone}.`);
  }

  return `${year}-${month}-${day}`;
}

function formatLocalClock(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;

  if (!hour || !minute) {
    throw new Error(`Could not resolve local time for ${timeZone}.`);
  }

  return {
    hour: Number(hour),
    minute: Number(minute),
  };
}

function severityRank(severity: ConventionLifecycleHealthSeverity) {
  switch (severity) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'info':
      return 1;
    case 'healthy':
    default:
      return 0;
  }
}

function recommendedActionRank(action: ConventionLifecycleRecommendedAction) {
  switch (action) {
    case 'retry_closeout':
      return 6;
    case 'regenerate_recaps':
      return 5;
    case 'close_and_archive':
      return 4;
    case 'review_dates':
      return 3;
    case 'rotate_dailies':
      return 2;
    case 'start_manually':
      return 1;
    case 'none':
    default:
      return 0;
  }
}
