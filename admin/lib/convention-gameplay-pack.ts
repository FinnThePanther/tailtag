import { createServiceRoleClient } from './supabase/service';
import type { Database } from '@/types/database';

type ServiceClient = ReturnType<typeof createServiceRoleClient>;
type ConventionRow = Database['public']['Tables']['conventions']['Row'];

export type GameplayPackResult = {
  tasks: { created: number; existing: number };
  achievements: { created: number; existing: number };
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

export async function generateDefaultGameplayPack(
  conventionId: string,
  supabase = createServiceRoleClient(),
): Promise<GameplayPackResult> {
  const convention = await fetchGameplayPackConvention(supabase, conventionId);
  const taskResult = await ensureDefaultTasks(supabase, conventionId);
  const achievementResult = await ensureDefaultAchievements(supabase, convention);

  return {
    tasks: taskResult,
    achievements: achievementResult,
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
    const sourceTaskId =
      typeof task.metadata.sourceTaskId === 'string' ? task.metadata.sourceTaskId : null;
    const match = trackedTasks.find((existingTask) => {
      const metadata = metadataRecord(existingTask.metadata);
      return (
        existingTask.name === task.name ||
        metadata.defaultPackKey === task.key ||
        (sourceTaskId !== null && metadata.sourceTaskId === sourceTaskId)
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

async function ensureDefaultAchievements(
  supabase: ServiceClient,
  convention: Pick<ConventionRow, 'id' | 'name'>,
) {
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
        reset_mode: achievement.resetMode ?? 'none',
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
