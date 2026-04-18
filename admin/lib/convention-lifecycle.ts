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

export type ConventionCloseoutSource = 'admin_close' | 'admin_retry' | 'admin_regenerate';

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
  const dateState = getConventionDateState(convention, localDay);
  const [
    { count: activeRotationTasks, error: rotationError },
    { count: todayAssignments, error: assignmentError },
    { count: acceptedConventionCatches, error: acceptedError },
    { count: pendingConventionCatches, error: pendingError },
    { count: activeProfileMemberships, error: membershipError },
    { count: activeFursuitAssignments, error: fursuitError },
    { count: participantRecaps, error: recapError },
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
  ]);

  if (rotationError) throw rotationError;
  if (assignmentError) throw assignmentError;
  if (acceptedError) throw acceptedError;
  if (pendingError) throw pendingError;
  if (membershipError) throw membershipError;
  if (fursuitError) throw fursuitError;
  if (recapError) throw recapError;

  const diagnostics: ConventionLifecycleDiagnostics = {
    activeRotationTasks: activeRotationTasks ?? 0,
    todayAssignments: todayAssignments ?? 0,
    acceptedConventionCatches: acceptedConventionCatches ?? 0,
    pendingConventionCatches: pendingConventionCatches ?? 0,
    activeProfileMemberships: activeProfileMemberships ?? 0,
    activeFursuitAssignments: activeFursuitAssignments ?? 0,
    participantRecaps: participantRecaps ?? 0,
    archivedAt: convention.archived_at ?? null,
    closedAt: convention.closed_at ?? null,
    closeoutError: convention.closeout_error ?? null,
  };

  const warnings: string[] = [];
  let severity: ConventionLifecycleHealthSeverity = 'healthy';
  let recommendedAction: ConventionLifecycleRecommendedAction = 'none';

  const addWarning = (
    warning: string,
    nextAction: ConventionLifecycleRecommendedAction,
    nextSeverity: ConventionLifecycleHealthSeverity = 'warning',
  ) => {
    warnings.push(warning);
    if (severityRank(nextSeverity) > severityRank(severity)) {
      severity = nextSeverity;
      recommendedAction = nextAction;
    }
  };

  if (convention.status === 'live') {
    if (dateState === 'after_window') {
      addWarning(
        'The local convention date window has ended. Close and archive it manually.',
        'close_and_archive',
        'critical',
      );
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
    addWarning(
      diagnostics.closeoutError
        ? 'Closeout failed. Retry closeout after reviewing the error.'
        : 'Closeout appears interrupted. Retry closeout to finish archiving.',
      'retry_closeout',
      diagnostics.closeoutError ? 'critical' : 'warning',
    );
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

export async function ensureConventionDailies(conventionId: string, actorId: string) {
  if (!env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to rotate daily tasks.');
  }

  const params = new URLSearchParams({
    convention_id: conventionId,
    source: 'admin_manual',
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
  const { data: existingTasks, error } = await supabase
    .from('daily_tasks')
    .select('id, name, metadata')
    .eq('convention_id', conventionId);

  if (error) throw error;

  let created = 0;
  let existing = 0;

  for (const spec of DEFAULT_TASKS) {
    const match = (existingTasks ?? []).find((task) => {
      const metadata = task.metadata as Record<string, unknown> | null;
      return task.name === spec.name || metadata?.defaultPackKey === spec.key;
    });

    if (match) {
      existing += 1;
      continue;
    }

    const { error: insertError } = await supabase.from('daily_tasks').insert({
      convention_id: conventionId,
      name: spec.name,
      description: spec.description,
      kind: spec.kind,
      requirement: spec.requirement,
      is_active: true,
      metadata: spec.metadata,
    } as Database['public']['Tables']['daily_tasks']['Insert']);

    if (insertError) throw insertError;
    created += 1;
  }

  return { created, existing };
}

async function ensureDefaultAchievements(supabase: ServiceClient, convention: ConventionRow) {
  let created = 0;
  let existing = 0;
  const normalizedId = convention.id.replace(/-/g, '');
  const keyPrefix = `CONVENTION_${normalizedId.toUpperCase()}`;

  for (const spec of DEFAULT_ACHIEVEMENTS) {
    const achievementKey = `${keyPrefix}_${spec.keySuffix}`;
    const ruleSlug = `convention-${normalizedId}-${spec.slugSuffix}`;

    const [{ data: existingAchievement, error: achievementError }, ruleResult] = await Promise.all([
      supabase.from('achievements').select('id, rule_id').eq('key', achievementKey).maybeSingle(),
      supabase.from('achievement_rules').select('rule_id').eq('slug', ruleSlug).maybeSingle(),
    ]);

    if (achievementError) throw achievementError;
    if (ruleResult.error) throw ruleResult.error;

    let ruleId = ruleResult.data?.rule_id ?? existingAchievement?.rule_id ?? null;

    if (!ruleId) {
      const { data: insertedRule, error: ruleInsertError } = await supabase
        .from('achievement_rules')
        .insert({
          kind: spec.kind,
          slug: ruleSlug,
          name: `${convention.name}: ${spec.name}`,
          description: spec.description,
          is_active: true,
          rule: spec.rule,
          metadata: { convention_id: convention.id, defaultPackKey: spec.keySuffix },
        } as Database['public']['Tables']['achievement_rules']['Insert'])
        .select('rule_id')
        .single();

      if (ruleInsertError) throw ruleInsertError;
      ruleId = insertedRule.rule_id;
    }

    if (existingAchievement) {
      if (!existingAchievement.rule_id && ruleId) {
        await supabase
          .from('achievements')
          .update({ rule_id: ruleId })
          .eq('id', existingAchievement.id);
      }
      existing += 1;
      continue;
    }

    const { error: insertError } = await supabase.from('achievements').insert({
      convention_id: convention.id,
      key: achievementKey,
      name: spec.name,
      description: spec.description,
      category: spec.category,
      recipient_role: spec.recipientRole,
      trigger_event: spec.triggerEvent,
      is_active: true,
      rule_id: ruleId,
    } as Database['public']['Tables']['achievements']['Insert']);

    if (insertError) throw insertError;
    created += 1;
  }

  return { created, existing };
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
