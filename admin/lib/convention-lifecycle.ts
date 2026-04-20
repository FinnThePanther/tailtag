import { env } from './env';
import { createServiceRoleClient } from './supabase/service';
import type { Database } from '@/types/database';

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

export type GameplayPackResult = {
  tasks: { created: number; existing: number };
  achievements: { created: number; existing: number };
};

export type ConventionCloseoutSource =
  | 'admin_close'
  | 'admin_retry'
  | 'admin_regenerate'
  | 'cron_close'
  | 'cron_retry';

export type ConventionDailiesSource =
  | 'admin_manual'
  | 'admin_detail'
  | 'create_convention'
  | 'start_convention';

export type ConventionCloseoutResult = {
  convention_id: string;
  status: 'archived';
  already_archived: boolean;
  summary: Record<string, unknown>;
  recaps_generated: number;
  pending_catches_expired: number;
  profile_memberships_removed: number;
  fursuit_assignments_removed: number;
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

type DefaultTaskSpec = {
  key: string;
  name: string;
  description: string;
  kind: string;
  requirement: number;
  metadata: Record<string, unknown>;
};

type DefaultAchievementSpec = {
  keySuffix: string;
  slugSuffix: string;
  name: string;
  description: string;
  category: Database['public']['Enums']['achievement_category'];
  kind: string;
  recipientRole: Database['public']['Enums']['achievement_recipient_role'];
  triggerEvent: Database['public']['Enums']['achievement_trigger_event'];
  rule: Record<string, unknown>;
};

type ExistingTaskRow = Pick<
  Database['public']['Tables']['daily_tasks']['Row'],
  'id' | 'name' | 'metadata'
>;

type CatalogTaskRow = Pick<
  Database['public']['Tables']['daily_tasks']['Row'],
  'id' | 'name' | 'description' | 'kind' | 'requirement' | 'metadata' | 'rule_id'
>;

type ExistingAchievementRow = Pick<
  Database['public']['Tables']['achievements']['Row'],
  'id' | 'key' | 'rule_id'
>;

type CatalogAchievementRuleRow = Pick<
  Database['public']['Tables']['achievement_rules']['Row'],
  | 'rule_id'
  | 'kind'
  | 'slug'
  | 'name'
  | 'description'
  | 'is_active'
  | 'version'
  | 'rule'
  | 'metadata'
>;

type CatalogAchievementRow = Pick<
  Database['public']['Tables']['achievements']['Row'],
  | 'id'
  | 'key'
  | 'name'
  | 'description'
  | 'category'
  | 'recipient_role'
  | 'trigger_event'
  | 'reset_mode'
  | 'reset_timezone'
  | 'reset_grace_minutes'
> & {
  achievement_rules: CatalogAchievementRuleRow | CatalogAchievementRuleRow[] | null;
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

const DEFAULT_TASKS: DefaultTaskSpec[] = [
  {
    key: 'catch-3-fursuits',
    name: 'Catch 3 fursuits',
    description: 'Catch three fursuits at this convention.',
    kind: 'catch',
    requirement: 3,
    metadata: {
      defaultPackKey: 'catch-3-fursuits',
      eventType: 'catch_performed',
      metric: 'total',
      includeTutorialCatches: false,
      filters: [],
    },
  },
  {
    key: 'meet-someone-new',
    name: 'Meet someone new',
    description: 'Catch one unique fursuit you have not met today.',
    kind: 'catch',
    requirement: 1,
    metadata: {
      defaultPackKey: 'meet-someone-new',
      eventType: 'catch_performed',
      metric: 'unique',
      uniqueBy: 'payload.fursuit_id',
      includeTutorialCatches: false,
      filters: [],
    },
  },
  {
    key: 'check-the-leaderboard',
    name: 'Check the leaderboard',
    description: 'Open the convention leaderboard.',
    kind: 'leaderboard',
    requirement: 1,
    metadata: {
      defaultPackKey: 'check-the-leaderboard',
      eventType: 'leaderboard_refreshed',
      metric: 'total',
      includeTutorialCatches: false,
      filters: [],
    },
  },
  {
    key: 'read-a-fursuit-bio',
    name: 'Read a fursuit bio',
    description: "Read another fursuiter's bio.",
    kind: 'view_bio',
    requirement: 1,
    metadata: {
      defaultPackKey: 'read-a-fursuit-bio',
      eventType: 'fursuit_bio_viewed',
      metric: 'total',
      includeTutorialCatches: false,
      filters: [{ path: 'payload.owner_id', notEqualsUserId: true }],
    },
  },
];

const DEFAULT_ACHIEVEMENTS: DefaultAchievementSpec[] = [
  {
    keySuffix: 'CHECKED_IN',
    slugSuffix: 'checked-in',
    name: 'Checked In',
    description: 'Join this convention in TailTag.',
    category: 'meta',
    kind: 'convention_joined',
    recipientRole: 'any',
    triggerEvent: 'convention_joined',
    rule: {},
  },
  {
    keySuffix: 'CROWD_FAVORITE',
    slugSuffix: 'crowd-favorite',
    name: 'Crowd Favorite',
    description: 'Have your fursuit caught by ten unique players at this convention.',
    category: 'fursuiter',
    kind: 'fursuit_caught_count_at_convention',
    recipientRole: 'fursuit_owner',
    triggerEvent: 'catch_performed',
    rule: {
      threshold: 10,
      metric: 'unique',
      uniqueBy: 'payload.catcher_id',
      filters: [],
    },
  },
  {
    keySuffix: 'LOCAL_LEGEND',
    slugSuffix: 'local-legend',
    name: 'Local Legend',
    description: 'Have your fursuit caught by twenty-five unique players at this convention.',
    category: 'fursuiter',
    kind: 'fursuit_caught_count_at_convention',
    recipientRole: 'fursuit_owner',
    triggerEvent: 'catch_performed',
    rule: {
      threshold: 25,
      metric: 'unique',
      uniqueBy: 'payload.catcher_id',
      filters: [],
    },
  },
];

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

export async function generateDefaultGameplayPack(
  conventionId: string,
  supabase = createServiceRoleClient(),
): Promise<GameplayPackResult> {
  const convention = await fetchLifecycleConvention(supabase, conventionId);
  const taskResult = await ensureDefaultTasks(supabase, conventionId);
  const achievementResult = await ensureDefaultAchievements(supabase, convention);

  return {
    tasks: taskResult,
    achievements: achievementResult,
  };
}

export async function ensureConventionDailies(
  conventionId: string,
  actorId: string,
  source: ConventionDailiesSource = 'admin_manual',
) {
  if (!env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to rotate daily tasks.');
  }

  const params = new URLSearchParams({
    convention_id: conventionId,
    source,
    actor_id: actorId,
  });

  const response = await fetch(`${env.supabaseUrl}/functions/v1/rotate-dailys?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = body && typeof body.error === 'string' ? body.error : 'Failed to rotate dailies.';
    throw new Error(error);
  }

  return body;
}

export async function closeOutConvention(
  conventionId: string,
  actorId: string,
  source: ConventionCloseoutSource,
  options: { forceRegenerate?: boolean } = {},
): Promise<ConventionCloseoutResult> {
  if (!env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to close out conventions.');
  }

  const response = await fetch(`${env.supabaseUrl}/functions/v1/close-out-convention`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      convention_id: conventionId,
      actor_id: actorId,
      source,
      force_regenerate: options.forceRegenerate === true,
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error =
      body && typeof body.error === 'string' ? body.error : 'Failed to close out convention.';
    throw new Error(error);
  }

  return body as ConventionCloseoutResult;
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

async function ensureDefaultTasks(supabase: ServiceClient, conventionId: string) {
  const [{ data: existingTasks, error }, { data: catalogTasks, error: catalogError }] =
    await Promise.all([
      supabase.from('daily_tasks').select('id, name, metadata').eq('convention_id', conventionId),
      supabase
        .from('daily_tasks')
        .select('id, name, description, kind, requirement, metadata, rule_id')
        .is('convention_id', null)
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ]);

  if (error) throw error;
  if (catalogError) throw catalogError;

  const trackedTasks = [...((existingTasks ?? []) as ExistingTaskRow[])];
  let created = 0;
  let existing = 0;

  const ensureTask = async (task: {
    key: string;
    name: string;
    description: string;
    kind: string;
    requirement: number;
    metadata: Record<string, unknown>;
    ruleId?: string | null;
  }) => {
    const match = trackedTasks.find((existingTask) => {
      const metadata = metadataRecord(existingTask.metadata);
      return (
        existingTask.name === task.name ||
        metadata.defaultPackKey === task.key ||
        metadata.sourceTaskId === task.key
      );
    });

    if (match) {
      existing += 1;
      return;
    }

    const metadata = {
      ...task.metadata,
      defaultPackKey: task.key,
    };

    const { data: insertedTask, error: insertError } = await supabase
      .from('daily_tasks')
      .insert({
        convention_id: conventionId,
        name: task.name,
        description: task.description,
        kind: task.kind,
        requirement: task.requirement,
        rule_id: task.ruleId ?? null,
        is_active: true,
        metadata,
      } as Database['public']['Tables']['daily_tasks']['Insert'])
      .select('id, name, metadata')
      .single();

    if (insertError) throw insertError;
    trackedTasks.push(insertedTask as ExistingTaskRow);
    created += 1;
  };

  for (const catalogTask of (catalogTasks ?? []) as CatalogTaskRow[]) {
    await ensureTask({
      key: `global-task-${catalogTask.id}`,
      name: catalogTask.name,
      description: catalogTask.description,
      kind: catalogTask.kind,
      requirement: catalogTask.requirement,
      ruleId: catalogTask.rule_id,
      metadata: {
        ...metadataRecord(catalogTask.metadata),
        defaultPackSource: 'global_catalog',
        sourceTaskId: catalogTask.id,
        sourceTaskName: catalogTask.name,
      },
    });
  }

  for (const spec of DEFAULT_TASKS) {
    await ensureTask({
      ...spec,
      metadata: {
        ...spec.metadata,
        defaultPackSource: 'starter_pack',
      },
    });
  }

  return { created, existing };
}

async function ensureDefaultAchievements(supabase: ServiceClient, convention: ConventionRow) {
  let created = 0;
  let existing = 0;
  const normalizedId = convention.id.replace(/-/g, '');
  const keyPrefix = `CONVENTION_${normalizedId.toUpperCase()}`;

  const [
    { data: existingAchievements, error: existingError },
    { data: catalogAchievements, error: catalogError },
  ] = await Promise.all([
    supabase.from('achievements').select('id, key, rule_id').eq('convention_id', convention.id),
    supabase
      .from('achievements')
      .select(
        [
          'id',
          'key',
          'name',
          'description',
          'category',
          'recipient_role',
          'trigger_event',
          'reset_mode',
          'reset_timezone',
          'reset_grace_minutes',
          'achievement_rules (rule_id, kind, slug, name, description, is_active, version, rule, metadata)',
        ].join(', '),
      )
      .is('convention_id', null)
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ]);

  if (existingError) throw existingError;
  if (catalogError) throw catalogError;

  const trackedAchievements = [...((existingAchievements ?? []) as ExistingAchievementRow[])];

  const ensureAchievement = async (achievement: {
    key: string;
    name: string;
    description: string;
    category: Database['public']['Enums']['achievement_category'];
    recipientRole: Database['public']['Enums']['achievement_recipient_role'];
    triggerEvent: Database['public']['Enums']['achievement_trigger_event'];
    ruleSlug: string;
    ruleKind: string;
    rule: Record<string, unknown>;
    ruleName: string;
    ruleDescription: string | null;
    ruleVersion?: number;
    ruleMetadata: Record<string, unknown>;
    resetMode?: string;
    resetTimezone?: string;
    resetGraceMinutes?: number;
  }) => {
    const [{ data: existingRule, error: ruleError }] = await Promise.all([
      supabase
        .from('achievement_rules')
        .select('rule_id')
        .eq('slug', achievement.ruleSlug)
        .maybeSingle(),
    ]);

    if (ruleError) throw ruleError;

    const existingAchievement = trackedAchievements.find((item) => item.key === achievement.key);
    let ruleId = existingRule?.rule_id ?? existingAchievement?.rule_id ?? null;

    if (!ruleId) {
      const { data: insertedRule, error: ruleInsertError } = await supabase
        .from('achievement_rules')
        .insert({
          kind: achievement.ruleKind,
          slug: achievement.ruleSlug,
          name: achievement.ruleName,
          description: achievement.ruleDescription,
          is_active: true,
          version: achievement.ruleVersion ?? 1,
          rule: achievement.rule,
          metadata: achievement.ruleMetadata,
        } as Database['public']['Tables']['achievement_rules']['Insert'])
        .select('rule_id')
        .single();

      if (ruleInsertError) throw ruleInsertError;
      ruleId = insertedRule.rule_id;
    }

    if (existingAchievement) {
      if (!existingAchievement.rule_id && ruleId) {
        const { error: updateError } = await supabase
          .from('achievements')
          .update({ rule_id: ruleId })
          .eq('id', existingAchievement.id);

        if (updateError) throw updateError;
      }

      existing += 1;
      return;
    }

    const { data: insertedAchievement, error: insertError } = await supabase
      .from('achievements')
      .insert({
        convention_id: convention.id,
        key: achievement.key,
        name: achievement.name,
        description: achievement.description,
        category: achievement.category,
        recipient_role: achievement.recipientRole,
        trigger_event: achievement.triggerEvent,
        reset_mode: achievement.resetMode ?? 'permanent',
        reset_timezone: achievement.resetTimezone ?? 'UTC',
        reset_grace_minutes: achievement.resetGraceMinutes ?? 0,
        is_active: true,
        rule_id: ruleId,
      } as Database['public']['Tables']['achievements']['Insert'])
      .select('id, key, rule_id')
      .single();

    if (insertError) throw insertError;
    trackedAchievements.push(insertedAchievement as ExistingAchievementRow);
    created += 1;
  };

  for (const catalogAchievement of (catalogAchievements ??
    []) as unknown as CatalogAchievementRow[]) {
    const sourceRule = sourceAchievementRule(catalogAchievement.achievement_rules);
    const sourceMetadata = metadataRecord(sourceRule?.metadata);
    const sourceRuleId = sourceRule?.rule_id;

    await ensureAchievement({
      key: `${keyPrefix}_${catalogAchievement.key}`,
      name: catalogAchievement.name,
      description: catalogAchievement.description,
      category: catalogAchievement.category,
      recipientRole: catalogAchievement.recipient_role,
      triggerEvent: normalizeCatalogTriggerEvent(catalogAchievement.trigger_event),
      resetMode: catalogAchievement.reset_mode,
      resetTimezone: catalogAchievement.reset_timezone,
      resetGraceMinutes: catalogAchievement.reset_grace_minutes,
      ruleSlug: `convention-${normalizedId}-global-${slugify(catalogAchievement.key)}`,
      ruleKind: sourceRule?.kind ?? catalogAchievement.trigger_event,
      rule: metadataRecord(sourceRule?.rule),
      ruleName: `${convention.name}: ${catalogAchievement.name}`,
      ruleDescription: sourceRule?.description ?? catalogAchievement.description,
      ruleVersion: sourceRule?.version,
      ruleMetadata: stripUndefined({
        ...sourceMetadata,
        convention_id: convention.id,
        defaultPackSource: 'global_catalog',
        sourceAchievementId: catalogAchievement.id,
        sourceAchievementKey: catalogAchievement.key,
        sourceRuleId,
      }),
    });
  }

  for (const spec of DEFAULT_ACHIEVEMENTS) {
    await ensureAchievement({
      key: `${keyPrefix}_${spec.keySuffix}`,
      name: spec.name,
      description: spec.description,
      category: spec.category,
      recipientRole: spec.recipientRole,
      triggerEvent: spec.triggerEvent,
      ruleSlug: `convention-${normalizedId}-${spec.slugSuffix}`,
      ruleKind: spec.kind,
      rule: spec.rule,
      ruleName: `${convention.name}: ${spec.name}`,
      ruleDescription: spec.description,
      ruleMetadata: {
        convention_id: convention.id,
        defaultPackSource: 'starter_pack',
        defaultPackKey: spec.keySuffix,
      },
    });
  }

  return { created, existing };
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function sourceAchievementRule(
  value: CatalogAchievementRow['achievement_rules'],
): CatalogAchievementRuleRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function stripUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function normalizeCatalogTriggerEvent(
  triggerEvent: Database['public']['Enums']['achievement_trigger_event'],
): Database['public']['Enums']['achievement_trigger_event'] {
  if (triggerEvent === 'catch.created') return 'catch_performed';
  if (triggerEvent === 'convention.checkin') return 'convention_joined';
  return triggerEvent;
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
