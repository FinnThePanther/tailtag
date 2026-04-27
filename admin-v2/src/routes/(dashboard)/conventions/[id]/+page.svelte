<script lang="ts">
  import {
    AlertTriangle,
    Archive,
    ArrowUpRight,
    CalendarClock,
    CheckCircle2,
    MapPin,
    Play,
    RefreshCcw,
    SlidersHorizontal,
    Trash2,
    Users,
    Wand2
  } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';
  import Table from '$lib/components/Table.svelte';
  import type { ConventionAchievementRow, ConventionTaskRow } from '$lib/server/data';
  import ActiveBadge from './ActiveBadge.svelte';
  import Info from './InfoTile.svelte';
  import ActionButton from './LifecycleActionButton.svelte';

  let { data, form } = $props();

  const TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Sydney',
    'Australia/Sydney'
  ];

  const TASK_KINDS = [
    { value: 'catch', label: 'Catch' },
    { value: 'leaderboard', label: 'Leaderboard' },
    { value: 'view_bio', label: 'View bio' }
  ];

  const CATEGORIES = [
    { value: 'catching', label: 'Catching' },
    { value: 'variety', label: 'Variety' },
    { value: 'dedication', label: 'Dedication' },
    { value: 'fursuiter', label: 'Fursuiter' },
    { value: 'fun', label: 'Fun' },
    { value: 'meta', label: 'Meta' }
  ];

  const RULE_KINDS = [
    {
      value: 'fursuit_caught_count_at_convention',
      label: 'Fursuit caught count (at convention)',
      hasThreshold: true
    },
    { value: 'convention_joined', label: 'Convention joined', hasThreshold: false }
  ];

  const METRIC_OPTIONS = [
    { value: 'total', label: 'Total count' },
    { value: 'unique', label: 'Unique (deduplicated)' }
  ];

  const config = $derived(normalizeConfig(data.convention.config));
  const lifecycleCopy = $derived(getLifecycleCopy(data.convention.status, data.readiness));
  const showStartupReadiness = $derived(
    data.convention.status === 'draft' || data.convention.status === 'scheduled'
  );
  const readinessLabel = $derived(
    showStartupReadiness
      ? data.readiness.ready
        ? 'Ready'
        : `${data.readiness.blockingIssues.length} blocker(s)`
      : 'Not applicable'
  );
  const dateAllowsStartAction = $derived(
    data.readiness.dateState === 'before_window' || data.readiness.dateState === 'inside_window'
  );
  const scheduledForFuture = $derived(
    data.convention.status === 'scheduled' && data.readiness.dateState === 'before_window'
  );
  const hasStartupBlockers = $derived(
    data.readiness.blockingIssues.some(
      (issue: string) => issue !== 'The local convention date window has already ended.'
    )
  );
  const startDisabled = $derived(
    data.convention.status === 'live' ||
      scheduledForFuture ||
      !dateAllowsStartAction ||
      hasStartupBlockers
  );
  const rotateDisabled = $derived(
    data.convention.status !== 'live' || data.readiness.dateState !== 'inside_window'
  );
  const closeDisabled = $derived(data.convention.status !== 'live');
  const retryCloseoutDisabled = $derived(data.convention.status !== 'closed');
  const regenerateDisabled = $derived(data.convention.status !== 'archived');
  const devDeleteDisabled = $derived(data.convention.status !== 'archived');
  const startLabel = $derived(
    data.convention.status === 'scheduled' && data.readiness.dateState === 'inside_window'
      ? 'Start manually'
      : data.convention.status === 'scheduled' && data.readiness.dateState === 'before_window'
        ? 'Scheduled'
        : data.readiness.dateState === 'before_window'
          ? 'Schedule convention'
          : 'Start convention'
  );

  let detailName = $state('');
  let detailSlug = $state('');
  let slugEdited = $state(false);
  let initializedConventionId = $state<string | null>(null);
  let taskForm = $state(defaultTaskForm());
  let editingTaskId = $state<string | null>(null);
  let achievementForm = $state(defaultAchievementForm());
  let editingAchievementId = $state<string | null>(null);
  let editingRuleId = $state<string | null>(null);

  const selectedAchievementKind = $derived(
    RULE_KINDS.find((kind) => kind.value === achievementForm.kind) ?? RULE_KINDS[0]
  );

  $effect(() => {
    if (initializedConventionId !== data.convention.id) {
      detailName = data.convention.name;
      detailSlug = data.convention.slug;
      slugEdited = false;
      initializedConventionId = data.convention.id;
    }
  });

  function normalizeConfig(raw: any) {
    return {
      catchCooldownSeconds: Number(raw?.cooldowns?.catch_seconds ?? 0),
      catchPoints: Number(raw?.points?.catch ?? 1),
      featureStaffMode: Boolean(raw?.feature_flags?.staff_mode ?? true)
    };
  }

  function toSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  function toAchievementKey(name: string) {
    return name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function startSkippedCopy(reason: string | null) {
    if (reason === 'before_window')
      return 'Convention created. It was not started because its local start date is still in the future.';
    if (reason === 'after_window')
      return 'Convention created. It was not started because its local date window has already ended.';
    if (reason === 'not_ready')
      return 'Convention created. It was not started because readiness checks still need attention.';
    return null;
  }

  function getLifecycleCopy(status: string, readiness: typeof data.readiness) {
    if (status === 'archived') return 'Closeout is complete and recaps are available to players';
    if (status === 'closed') return 'Gameplay is stopped; retry closeout to finish archiving';
    if (status === 'canceled') return 'This convention was canceled and is not playable';
    if (status === 'scheduled' && readiness.dateState === 'inside_window')
      return 'Ready to start manually';
    if (status === 'scheduled' && readiness.dateState === 'before_window')
      return 'Scheduled for a future local date';
    if (status === 'live')
      return 'Players can join while the convention remains inside its date window';
    if (readiness.dateState === 'before_window') return 'Ready future conventions can be scheduled';
    if (readiness.dateState === 'inside_window') return 'Start the convention when staff are ready';
    if (readiness.dateState === 'after_window') return 'This convention is past its local date window';
    return 'Complete required setup before startup';
  }

  function statusClass(status: string) {
    return status === 'live'
      ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200'
      : status === 'scheduled'
        ? 'border-sky-300/40 bg-sky-400/10 text-sky-200'
        : status === 'draft'
          ? 'border-slate-300/30 bg-white/5 text-slate-200'
          : 'border-amber-300/40 bg-amber-400/10 text-amber-100';
  }

  function healthTextClass(severity: string) {
    if (severity === 'critical') return 'text-red-200';
    if (severity === 'warning') return 'text-amber-100';
    if (severity === 'info') return 'text-sky-200';
    return 'text-emerald-200';
  }

  function formatRecommendedAction(action: string) {
    if (action === 'start_manually') return 'Start manually';
    if (action === 'close_and_archive') return 'Close and archive';
    if (action === 'retry_closeout') return 'Retry closeout';
    if (action === 'regenerate_recaps') return 'Regenerate recaps';
    if (action === 'review_dates') return 'Review dates';
    if (action === 'rotate_dailies') return "Rotate today's tasks";
    return 'No action needed';
  }

  function formatAutomationSource(source: string | null) {
    if (source === 'cron_close') return 'Auto-close';
    if (source === 'cron_retry') return 'Auto-retry';
    if (source === 'admin_close') return 'Admin close';
    if (source === 'admin_retry') return 'Admin retry';
    if (source === 'admin_regenerate') return 'Admin regenerate';
    return 'None';
  }

  function formatAutomationEligibility(diagnostics: typeof data.health.diagnostics) {
    if (diagnostics.automationEligibleForAutoClose) return 'Auto-close eligible';
    if (diagnostics.automationEligibleForRetry) return 'Auto-retry eligible';
    return 'Not eligible';
  }

  function formatDateTime(value: string | null) {
    return value ? new Date(value).toLocaleString() : null;
  }

  function getNumber(summary: Record<string, unknown> | null, key: string) {
    const value = summary?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function defaultTaskForm() {
    return {
      name: '',
      description: '',
      kind: TASK_KINDS[0].value,
      requirement: 1,
      metric: 'total',
      uniqueBy: 'payload.fursuit_id',
      speciesFilter: '',
      colorFilter: ''
    };
  }

  function taskFormFromTask(task: ConventionTaskRow) {
    const metadata = task.metadata;
    const filters = Array.isArray(metadata?.filters)
      ? (metadata.filters as Record<string, unknown>[])
      : [];
    const speciesEntry = filters.find((filter) => filter.path === 'payload.species');
    const colorEntry = filters.find((filter) => filter.path === 'payload.colors');
    return {
      name: task.name,
      description: task.description ?? '',
      kind: task.kind,
      requirement: task.requirement,
      metric: typeof metadata?.metric === 'string' ? metadata.metric : 'total',
      uniqueBy: typeof metadata?.uniqueBy === 'string' ? metadata.uniqueBy : 'payload.fursuit_id',
      speciesFilter: typeof speciesEntry?.equals === 'string' ? speciesEntry.equals : '',
      colorFilter: Array.isArray(colorEntry?.in) ? (colorEntry.in as string[]).join(', ') : ''
    };
  }

  function buildTaskMetadata(formState = taskForm) {
    const filters: { path: string; equals?: string; in?: string[]; notEqualsUserId?: boolean }[] =
      [];
    if (formState.kind === 'leaderboard') {
      return JSON.stringify({
        eventType: 'leaderboard_refreshed',
        metric: 'total',
        includeTutorialCatches: false,
        filters: []
      });
    }
    if (formState.kind === 'view_bio') {
      const metadata: Record<string, unknown> = {
        eventType: 'fursuit_bio_viewed',
        metric: formState.metric,
        includeTutorialCatches: false,
        filters: [{ path: 'payload.owner_id', notEqualsUserId: true }]
      };
      if (formState.metric === 'unique' && formState.uniqueBy.trim()) {
        metadata.uniqueBy = formState.uniqueBy.trim();
      }
      return JSON.stringify(metadata);
    }
    if (formState.speciesFilter.trim()) {
      filters.push({ path: 'payload.species', equals: formState.speciesFilter.trim() });
    }
    if (formState.colorFilter.trim()) {
      const colors = formState.colorFilter
        .split(',')
        .map((color) => color.trim())
        .filter(Boolean);
      if (colors.length) filters.push({ path: 'payload.colors', in: colors });
    }
    const metadata: Record<string, unknown> = {
      eventType: 'catch_performed',
      metric: formState.metric,
      includeTutorialCatches: false,
      filters
    };
    if (formState.metric === 'unique' && formState.uniqueBy.trim()) {
      metadata.uniqueBy = formState.uniqueBy.trim();
    }
    return JSON.stringify(metadata);
  }

  function summarizeMetadata(metadata: Record<string, unknown> | null) {
    if (!metadata) return null;
    const parts: string[] = [];
    if (metadata.metric === 'unique') parts.push('unique');
    const filters = Array.isArray(metadata.filters)
      ? (metadata.filters as Record<string, unknown>[])
      : [];
    for (const filter of filters) {
      if (filter.path === 'payload.species' && filter.equals) parts.push(`species=${filter.equals}`);
      if (filter.path === 'payload.colors' && Array.isArray(filter.in))
        parts.push(`colors=${(filter.in as string[]).join(',')}`);
    }
    return parts.length ? parts.join(', ') : null;
  }

  function defaultAchievementForm() {
    return {
      name: '',
      key: '',
      keyTouched: false,
      description: '',
      category: CATEGORIES[0].value,
      kind: RULE_KINDS[0].value,
      threshold: 1,
      metric: 'total',
      uniqueBy: 'payload.fursuit_id',
      speciesFilter: '',
      colorFilter: ''
    };
  }

  function achievementFormFromAchievement(achievement: ConventionAchievementRow) {
    const rule = achievement.rule;
    const filters = Array.isArray(rule?.filters) ? (rule.filters as Record<string, unknown>[]) : [];
    const speciesEntry = filters.find((filter) => filter.path === 'payload.species');
    const colorEntry = filters.find((filter) => filter.path === 'payload.colors');
    return {
      name: achievement.name,
      key: achievement.key,
      keyTouched: true,
      description: achievement.description ?? '',
      category: achievement.category,
      kind: achievement.rule_kind ?? RULE_KINDS[0].value,
      threshold:
        achievement.rule_kind === 'fursuit_caught_count_at_convention' && rule
          ? ((rule.threshold as number) ?? 1)
          : 1,
      metric: typeof rule?.metric === 'string' ? rule.metric : 'total',
      uniqueBy: typeof rule?.uniqueBy === 'string' ? rule.uniqueBy : 'payload.fursuit_id',
      speciesFilter: typeof speciesEntry?.equals === 'string' ? speciesEntry.equals : '',
      colorFilter: Array.isArray(colorEntry?.in) ? (colorEntry.in as string[]).join(', ') : ''
    };
  }

  function buildAchievementRule(formState = achievementForm) {
    if (formState.kind === 'convention_joined') return '{}';
    const filters: { path: string; equals?: string; in?: string[] }[] = [];
    if (formState.speciesFilter.trim()) {
      filters.push({ path: 'payload.species', equals: formState.speciesFilter.trim() });
    }
    if (formState.colorFilter.trim()) {
      const colors = formState.colorFilter
        .split(',')
        .map((color) => color.trim())
        .filter(Boolean);
      if (colors.length) filters.push({ path: 'payload.colors', in: colors });
    }
    const rule: Record<string, unknown> = {
      threshold: formState.threshold,
      metric: formState.metric,
      filters
    };
    if (formState.metric === 'unique' && formState.uniqueBy.trim()) {
      rule.uniqueBy = formState.uniqueBy.trim();
    }
    return JSON.stringify(rule);
  }

  function summarizeRule(rule: Record<string, unknown> | null, kind: string | null) {
    if (!rule || kind !== 'fursuit_caught_count_at_convention') return null;
    const parts: string[] = [];
    if (rule.metric === 'unique') parts.push('unique');
    const filters = Array.isArray(rule.filters) ? (rule.filters as Record<string, unknown>[]) : [];
    for (const filter of filters) {
      if (filter.path === 'payload.species' && filter.equals) parts.push(`species=${filter.equals}`);
      if (filter.path === 'payload.colors' && Array.isArray(filter.in))
        parts.push(`colors=${(filter.in as string[]).join(',')}`);
    }
    return parts.length ? parts.join(', ') : null;
  }

  function editTask(task: ConventionTaskRow) {
    editingTaskId = task.id;
    taskForm = taskFormFromTask(task);
  }

  function cancelTaskEdit() {
    editingTaskId = null;
    taskForm = defaultTaskForm();
  }

  function editAchievement(achievement: ConventionAchievementRow) {
    editingAchievementId = achievement.id;
    editingRuleId = achievement.rule_id;
    achievementForm = achievementFormFromAchievement(achievement);
  }

  function cancelAchievementEdit() {
    editingAchievementId = null;
    editingRuleId = null;
    achievementForm = defaultAchievementForm();
  }

  const closeoutSummary = $derived(
    (data.convention.closeout_summary as Record<string, unknown> | null) ?? null
  );
  const recapsGenerated = $derived(getNumber(closeoutSummary, 'recaps_generated'));
  const expiredPendingCatches = $derived(getNumber(closeoutSummary, 'pending_catches_expired'));
  const membershipsRemoved = $derived(getNumber(closeoutSummary, 'profile_memberships_removed'));
  const rosterRemoved = $derived(getNumber(closeoutSummary, 'fursuit_assignments_removed'));
</script>

<div class="space-y-4">
  {#if startSkippedCopy(data.startSkipped)}
    <div class="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
      {startSkippedCopy(data.startSkipped)}
    </div>
  {/if}
  {#if form?.error}
    <div class="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
      {form.error}
    </div>
  {/if}
  {#if form?.message}
    <div
      class="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100"
    >
      {form.message}
    </div>
  {/if}

  <Card title="Lifecycle" subtitle={lifecycleCopy}>
    {#snippet actions()}
      <span
        class={`rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(data.convention.status)}`}
      >
        {data.convention.status}
      </span>
    {/snippet}

    <div class="grid gap-3 md:grid-cols-4">
      <Info icon={CalendarClock} label="Date window">
        {data.convention.start_date && data.convention.end_date
          ? `${data.convention.start_date} to ${data.convention.end_date}`
          : 'Dates required'}
      </Info>
      <Info icon={CalendarClock} label="Local day">
        {data.readiness.localDay} ({data.convention.timezone || 'UTC'})
      </Info>
      <Info icon={CheckCircle2} label="Readiness">{readinessLabel}</Info>
      <Info icon={RefreshCcw} label="Today's rotation">
        {data.readiness.counts.todayAssignments > 0
          ? `${data.readiness.counts.todayAssignments} assigned`
          : 'Not rotated'}
      </Info>
    </div>

    <div class="mt-3 grid gap-3 md:grid-cols-3">
      <Info label="Active rotation tasks">{data.readiness.counts.activeRotationTasks}</Info>
      <Info label="Convention tasks">{data.readiness.counts.conventionTasks}</Info>
      <Info label="Convention achievements">{data.readiness.counts.conventionAchievements}</Info>
    </div>

    <div class="mt-3 grid gap-3 md:grid-cols-4">
      <Info label="Closed at">{formatDateTime(data.convention.closed_at) ?? 'Not closed'}</Info>
      <Info label="Archived at">{formatDateTime(data.convention.archived_at) ?? 'Not archived'}</Info>
      <Info label="Recaps">{recapsGenerated === null ? 'Not generated' : recapsGenerated}</Info>
      <Info label="Expired pending catches">
        {expiredPendingCatches === null ? 'Not run' : expiredPendingCatches}
      </Info>
    </div>

    <div class="mt-3 grid gap-3 md:grid-cols-4">
      <Info label="Accepted catches">{data.health.diagnostics.acceptedConventionCatches}</Info>
      <Info label="Pending catches">{data.health.diagnostics.pendingConventionCatches}</Info>
      <Info label="Active memberships">{data.health.diagnostics.activeProfileMemberships}</Info>
      <Info label="Fursuit roster">{data.health.diagnostics.activeFursuitAssignments}</Info>
    </div>

    <div class="mt-3 grid gap-3 md:grid-cols-3">
      <Info label="Health">
        <span class={healthTextClass(data.health.severity)}>{data.health.severity}</span>
      </Info>
      <Info label="Recommended action">
        {formatRecommendedAction(data.health.recommendedAction)}
      </Info>
      <Info label="Participant recap rows">{data.health.diagnostics.participantRecaps}</Info>
    </div>

    <div class="mt-3 grid gap-3 md:grid-cols-4">
      <Info label="Last closeout attempt">
        {formatDateTime(data.health.diagnostics.lastAutomationAttemptAt) ?? 'None'}
      </Info>
      <Info label="Closeout source">
        {formatAutomationSource(data.health.diagnostics.lastAutomationSource)}
      </Info>
      <Info label="Retry attempts, 7 days">
        {data.health.diagnostics.automationRetryAttemptsLast7Days}
      </Info>
      <Info label="Automation eligibility">
        {formatAutomationEligibility(data.health.diagnostics)}
      </Info>
    </div>

    {#if data.convention.status === 'archived'}
      <div class="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-3">
        <p class="text-sm font-semibold text-emerald-100">Archive complete</p>
        <p class="mt-1 text-sm text-emerald-50">
          {recapsGenerated ?? 0} participant recap(s), {membershipsRemoved ?? 0} active membership(s),
          and {rosterRemoved ?? 0} fursuit roster assignment(s) were processed.
        </p>
      </div>
    {/if}

    {#if data.convention.closeout_error}
      <div class="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3">
        <p class="flex items-center gap-2 text-sm font-semibold text-red-200">
          <AlertTriangle size={14} /> Closeout failed
        </p>
        <p class="mt-2 text-sm text-red-100">{data.convention.closeout_error}</p>
      </div>
    {/if}

    {#if data.health.warnings.length > 0}
      <div class="mt-4 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3">
        <p class="text-sm font-semibold text-amber-100">Lifecycle health</p>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50">
          {#each data.health.warnings as warning}
            <li>{warning}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if showStartupReadiness && data.readiness.blockingIssues.length > 0}
      <div class="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3">
        <p class="text-sm font-semibold text-red-200">Startup blockers</p>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-red-100">
          {#each data.readiness.blockingIssues as issue}
            <li>{issue}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if data.readiness.warnings.length > 0}
      <div class="mt-4 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3">
        <p class="text-sm font-semibold text-amber-100">Warnings</p>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50">
          {#each data.readiness.warnings as warning}
            <li>{warning}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <form class="mt-4 flex flex-wrap gap-2" method="POST" action="?/lifecycle">
      <ActionButton name="action" value="pack" icon={Wand2}>Generate gameplay pack</ActionButton>
      <ActionButton name="action" value="readiness" icon={CheckCircle2}>Run readiness check</ActionButton>
      <ActionButton name="action" value="start" icon={Play} disabled={startDisabled}>{startLabel}</ActionButton>
      <ActionButton name="action" value="rotate" icon={RefreshCcw} disabled={rotateDisabled}>
        Rotate today's tasks
      </ActionButton>
      <ActionButton
        name="action"
        value="close"
        icon={Archive}
        disabled={closeDisabled}
        confirmText="Close and archive this convention?\n\nPlayers will no longer be able to join or play in this convention.\nPending catches will expire.\nActive player memberships and fursuit roster entries will be removed.\nCatches, achievements, and recap data will be preserved.\n\nThis is not a hard delete."
      >
        Close and archive convention
      </ActionButton>
      <ActionButton name="action" value="retry" icon={RefreshCcw} disabled={retryCloseoutDisabled}>
        Retry closeout
      </ActionButton>
      <ActionButton name="action" value="regenerate" icon={RefreshCcw} disabled={regenerateDisabled}>
        Regenerate recaps
      </ActionButton>
      {#if data.showDevDelete}
        <ActionButton
          name="action"
          value="delete"
          icon={Trash2}
          variant="danger"
          disabled={devDeleteDisabled}
          confirmText="Delete this archived convention from the dev database?\n\nThis removes convention-scoped tasks, achievements, recaps, daily progress, active rows, and other test data tied to this convention.\nCatches, events, reports, and admin errors may remain but lose this convention link.\n\nThis is for dev cleanup only and cannot be undone."
        >
          Delete from dev
        </ActionButton>
      {/if}
    </form>

    {#if rotateDisabled && data.convention.status !== 'live'}
      <p class="mt-3 text-xs text-muted">Daily rotation is available after the convention is live.</p>
    {/if}
    {#if closeDisabled && data.convention.status !== 'live'}
      <p class="mt-2 text-xs text-muted">
        Closeout is available only for live conventions. Closed conventions can be retried.
      </p>
    {/if}
    {#if regenerateDisabled && data.convention.status !== 'archived'}
      <p class="mt-2 text-xs text-muted">
        Recap regeneration is available after the convention is archived.
      </p>
    {/if}
    {#if data.showDevDelete}
      <p class="mt-2 text-xs text-muted">
        Dev delete is available only for archived conventions and removes test data permanently.
      </p>
    {/if}
  </Card>

  <Card title="Convention Details" subtitle="Basic information about this event">
    {#snippet actions()}
      <div
        class="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-slate-200"
      >
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-primary">
          <Users size={14} />
        </div>
        <div>
          <p class="text-xs uppercase tracking-wide text-muted">Staff assigned</p>
          <p class="font-semibold text-white">{data.staff?.length ?? 0}</p>
        </div>
      </div>
    {/snippet}
    <form class="space-y-4" method="POST" action="?/details">
      <div class="grid gap-4 md:grid-cols-2">
        <label class="text-sm text-slate-200">
          Convention name
          <input
            name="name"
            required
            bind:value={detailName}
            oninput={() => {
              if (!slugEdited) detailSlug = toSlug(detailName);
            }}
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </label>
        <label class="text-sm text-slate-200">
          Slug
          <input
            name="slug"
            required
            bind:value={detailSlug}
            oninput={() => (slugEdited = true)}
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </label>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <label class="text-sm text-slate-200">
          Start date
          <input
            name="startDate"
            type="date"
            value={data.convention.start_date ?? ''}
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </label>
        <label class="text-sm text-slate-200">
          End date
          <input
            name="endDate"
            type="date"
            value={data.convention.end_date ?? ''}
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </label>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <label class="text-sm text-slate-200">
          Location
          <input
            name="location"
            value={data.convention.location ?? ''}
            placeholder="e.g. Convention Center, City, State"
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-muted focus:border-primary"
          />
        </label>
        <label class="text-sm text-slate-200">
          Timezone
          <select
            name="timezone"
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          >
            {#each TIMEZONES as timezone}
              <option value={timezone} selected={(data.convention.timezone ?? 'UTC') === timezone}>
                {timezone}
              </option>
            {/each}
          </select>
        </label>
      </div>
      <button
        class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
      >
        Save details
      </button>
    </form>
  </Card>

  <Card title="Configuration" subtitle="Adjust event rules and feature flags">
    {#snippet actions()}<SlidersHorizontal size={16} class="text-primary" />{/snippet}
    <form class="space-y-4" method="POST" action="?/config">
      <div class="grid gap-4 md:grid-cols-2">
        <label class="text-sm text-slate-200">
          Catch cooldown (seconds)
          <input
            name="catchCooldownSeconds"
            type="number"
            min="0"
            value={config.catchCooldownSeconds}
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </label>
        <label class="text-sm text-slate-200">
          Catch points
          <input
            name="catchPoints"
            type="number"
            min="0"
            value={config.catchPoints}
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </label>
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          name="featureStaffMode"
          checked={config.featureStaffMode}
          class="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
        />
        Enable Staff Mode for this event
      </label>
      <button
        class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
      >
        Save config
      </button>
    </form>
  </Card>

  <Card title="Geo-fence" subtitle="Manage on-site verification boundaries">
    {#snippet actions()}
      <a
        href={`/conventions/${data.convention.id}/location`}
        class="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-primary"
      >
        Manage map <ArrowUpRight size={14} />
      </a>
    {/snippet}
    <div class="grid gap-3 md:grid-cols-3">
      <Info icon={MapPin} label="Status" rounded="xl">
        {data.convention.geofence_enabled ? 'Enabled' : 'Disabled'}
      </Info>
      <Info icon={MapPin} label="Radius" rounded="xl">
        {data.convention.geofence_radius_meters
          ? `${data.convention.geofence_radius_meters}m`
          : 'Not configured'}
      </Info>
      <Info icon={MapPin} label="Verification" rounded="xl">
        {data.convention.location_verification_required ? 'Required on opt-in' : 'Optional'}
      </Info>
    </div>
  </Card>

  <Card title="Staff assignments" subtitle="People assigned to this convention">
    <Table headers={['Name', 'Role', 'Status', 'Assigned at', 'Notes']}>
      {#each data.staff ?? [] as assignment}
        {@const profile = Array.isArray(assignment.profiles)
          ? assignment.profiles[0]
          : assignment.profiles}
        <tr>
          <td class="px-4 py-3 text-slate-200">{profile?.username ?? 'Unknown'}</td>
          <td class="px-4 py-3 capitalize text-slate-200">{assignment.role}</td>
          <td class="px-4 py-3 text-slate-200">{assignment.status}</td>
          <td class="px-4 py-3 text-slate-200">
            {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : '-'}
          </td>
          <td class="px-4 py-3 text-slate-200">{assignment.notes ?? '-'}</td>
        </tr>
      {:else}
        <tr><td class="px-4 py-3 text-sm text-muted" colspan="5">No staff assigned yet.</td></tr>
      {/each}
    </Table>
  </Card>

  <Card title="Convention Daily Tasks" subtitle="Tasks added to the rotation for this convention">
    <Table headers={['Name', 'Kind', 'Req.', 'Filters', 'Status', '']}>
      {#each data.tasks as task}
        <tr>
          <td class="px-4 py-3">
            <p class="font-medium text-slate-200">{task.name}</p>
            {#if task.description}<p class="text-xs text-muted">{task.description}</p>{/if}
          </td>
          <td class="px-4 py-3">
            <span class="rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-slate-300">
              {task.kind}
            </span>
          </td>
          <td class="px-4 py-3 text-sm text-slate-300">{task.requirement}</td>
          <td class="px-4 py-3 text-xs text-slate-400">
            {summarizeMetadata(task.metadata) ?? 'none'}
          </td>
          <td class="px-4 py-3"><ActiveBadge active={task.is_active} /></td>
          <td class="px-4 py-3 text-right">
            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                onclick={() => editTask(task)}
                class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
              >
                Edit
              </button>
              <form method="POST" action="?/toggleTask">
                <input type="hidden" name="taskId" value={task.id} />
                <button
                  name="isActive"
                  value={task.is_active ? 'false' : 'true'}
                  class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
                >
                  {task.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </form>
              <form
                method="POST"
                action="?/deleteTask"
                onsubmit={() => globalThis.confirm('Delete this task? This cannot be undone.')}
              >
                <input type="hidden" name="taskId" value={task.id} />
                <button
                  class="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:border-red-500 disabled:opacity-50"
                >
                  Delete
                </button>
              </form>
            </div>
          </td>
        </tr>
      {:else}
        <tr><td class="px-4 py-3 text-sm text-muted" colspan="6">No convention tasks yet.</td></tr>
      {/each}
    </Table>

    <div class="mt-6 border-t border-border pt-5">
      <h3 class="mb-4 text-sm font-semibold text-white">
        {editingTaskId ? 'Edit task' : 'Add a task'}
      </h3>
      <form class="space-y-3" method="POST" action={editingTaskId ? '?/updateTask' : '?/createTask'}>
        {#if editingTaskId}<input type="hidden" name="taskId" value={editingTaskId} />{/if}
        <input type="hidden" name="metadata" value={buildTaskMetadata()} />
        <div class="grid gap-3 md:grid-cols-2">
          <label class="text-xs text-muted">
            Name
            <input
              name="name"
              required
              bind:value={taskForm.name}
              placeholder="e.g. Catch 5 bird fursuits"
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            />
          </label>
          <label class="text-xs text-muted">
            Description
            <input
              name="description"
              bind:value={taskForm.description}
              placeholder="Optional description"
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            />
          </label>
        </div>
        <div class="grid gap-3 md:grid-cols-3">
          <label class="text-xs text-muted">
            Kind
            <select
              name="kind"
              bind:value={taskForm.kind}
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            >
              {#each TASK_KINDS as kind}
                <option value={kind.value}>{kind.label}</option>
              {/each}
            </select>
          </label>
          <label class="text-xs text-muted">
            Requirement
            <input
              name="requirement"
              type="number"
              min="1"
              bind:value={taskForm.requirement}
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            />
          </label>
          <label class="text-xs text-muted">
            Metric
            <select
              bind:value={taskForm.metric}
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            >
              {#each METRIC_OPTIONS as metric}
                <option value={metric.value}>{metric.label}</option>
              {/each}
            </select>
          </label>
        </div>
        {#if taskForm.metric === 'unique'}
          <label class="text-xs text-muted">
            Unique by (payload path)
            <input
              bind:value={taskForm.uniqueBy}
              placeholder="payload.fursuit_id"
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            />
            <p class="mt-1 text-xs text-muted">
              Deduplicates events by this field, e.g. payload.fursuit_id for unique suits
            </p>
          </label>
        {/if}
        <div class="grid gap-3 md:grid-cols-2">
          <label class="text-xs text-muted">
            Species filter
            <input
              bind:value={taskForm.speciesFilter}
              placeholder="e.g. Bird (exact match, case-sensitive)"
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            />
          </label>
          <label class="text-xs text-muted">
            Color filter
            <input
              bind:value={taskForm.colorFilter}
              placeholder="e.g. Blue, Red (comma-separated, any match)"
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            />
          </label>
        </div>
        <div class="flex items-center gap-3">
          <button
            disabled={!taskForm.name.trim()}
            class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
          >
            {editingTaskId ? 'Save changes' : 'Create task'}
          </button>
          {#if editingTaskId}
            <button
              type="button"
              onclick={cancelTaskEdit}
              class="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
            >
              Cancel
            </button>
          {/if}
        </div>
      </form>
    </div>
  </Card>

  <Card
    title="Convention Achievements"
    subtitle="Achievements visible only to players opted into this convention"
  >
    <Table headers={['Name / Key', 'Category', 'Rule', 'Filters', 'Status', '']}>
      {#each data.achievements as achievement}
        <tr>
          <td class="px-4 py-3">
            <p class="font-medium text-slate-200">{achievement.name}</p>
            <p class="font-mono text-xs text-muted">{achievement.key}</p>
          </td>
          <td class="px-4 py-3">
            <span class="rounded-md bg-white/5 px-2 py-1 text-xs font-medium capitalize text-slate-300">
              {achievement.category}
            </span>
          </td>
          <td class="px-4 py-3">
            <p class="text-xs text-slate-300">{achievement.rule_kind ?? '-'}</p>
            {#if achievement.rule && achievement.rule_kind === 'fursuit_caught_count_at_convention'}
              <p class="text-xs text-muted">
                threshold: {(achievement.rule as { threshold?: number }).threshold ?? '?'}
              </p>
            {/if}
          </td>
          <td class="px-4 py-3 text-xs text-slate-400">
            {summarizeRule(achievement.rule, achievement.rule_kind) ?? 'none'}
          </td>
          <td class="px-4 py-3"><ActiveBadge active={achievement.is_active} /></td>
          <td class="px-4 py-3 text-right">
            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                onclick={() => editAchievement(achievement)}
                class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
              >
                Edit
              </button>
              <form method="POST" action="?/toggleAchievement">
                <input type="hidden" name="achievementId" value={achievement.id} />
                <button
                  name="isActive"
                  value={achievement.is_active ? 'false' : 'true'}
                  class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
                >
                  {achievement.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </form>
              <form
                method="POST"
                action="?/deleteAchievement"
                onsubmit={() =>
                  globalThis.confirm(`Delete "${achievement.name}"? This cannot be undone.`)}
              >
                <input type="hidden" name="achievementId" value={achievement.id} />
                <input type="hidden" name="ruleId" value={achievement.rule_id ?? ''} />
                <button
                  class="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:border-red-500 disabled:opacity-50"
                >
                  Delete
                </button>
              </form>
            </div>
          </td>
        </tr>
      {:else}
        <tr>
          <td class="px-4 py-3 text-sm text-muted" colspan="6">No convention achievements yet.</td>
        </tr>
      {/each}
    </Table>

    <div class="mt-6 border-t border-border pt-5">
      <h3 class="mb-4 text-sm font-semibold text-white">
        {editingAchievementId ? 'Edit achievement' : 'Add an achievement'}
      </h3>
      <form
        class="space-y-3"
        method="POST"
        action={editingAchievementId ? '?/updateAchievement' : '?/createAchievement'}
      >
        {#if editingAchievementId}
          <input type="hidden" name="achievementId" value={editingAchievementId} />
          <input type="hidden" name="ruleId" value={editingRuleId ?? ''} />
        {/if}
        <input type="hidden" name="rule" value={buildAchievementRule()} />
        <div class="grid gap-3 md:grid-cols-2">
          <label class="text-xs text-muted">
            Name
            <input
              name="name"
              required
              bind:value={achievementForm.name}
              oninput={() => {
                if (!achievementForm.keyTouched)
                  achievementForm.key = toAchievementKey(achievementForm.name);
              }}
              placeholder="e.g. Welcome to the Con"
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            />
          </label>
          <label class="text-xs text-muted">
            Key {editingAchievementId ? '(read-only)' : '(auto-filled, editable)'}
            <input
              name="key"
              required
              bind:value={achievementForm.key}
              oninput={() => {
                achievementForm.key = achievementForm.key.toUpperCase().replace(/[^A-Z0-9_]/g, '');
                achievementForm.keyTouched = true;
              }}
              disabled={Boolean(editingAchievementId)}
              placeholder="WELCOME_TO_THE_CON"
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-primary disabled:opacity-50"
            />
          </label>
        </div>
        <label class="text-xs text-muted">
          Description
          <input
            name="description"
            bind:value={achievementForm.description}
            placeholder="Shown to players on the achievement card"
            class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
          />
        </label>
        <div class="grid gap-3 md:grid-cols-2">
          <label class="text-xs text-muted">
            Category
            <select
              name="category"
              bind:value={achievementForm.category}
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            >
              {#each CATEGORIES as category}
                <option value={category.value}>{category.label}</option>
              {/each}
            </select>
          </label>
          <label class="text-xs text-muted">
            Rule kind
            <select
              name="kind"
              bind:value={achievementForm.kind}
              class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
            >
              {#each RULE_KINDS as kind}
                <option value={kind.value}>{kind.label}</option>
              {/each}
            </select>
          </label>
        </div>
        {#if selectedAchievementKind.hasThreshold}
          <div class="grid gap-3 md:grid-cols-2">
            <label class="text-xs text-muted">
              Threshold
              <input
                type="number"
                min="1"
                bind:value={achievementForm.threshold}
                class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </label>
            <label class="text-xs text-muted">
              Metric
              <select
                bind:value={achievementForm.metric}
                class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              >
                {#each METRIC_OPTIONS as metric}
                  <option value={metric.value}>{metric.label}</option>
                {/each}
              </select>
            </label>
          </div>
          {#if achievementForm.metric === 'unique'}
            <label class="text-xs text-muted">
              Unique by (payload path)
              <input
                bind:value={achievementForm.uniqueBy}
                placeholder="payload.fursuit_id"
                class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
              <p class="mt-1 text-xs text-muted">
                Deduplicates events by this field, e.g. payload.fursuit_id for unique suits
              </p>
            </label>
          {/if}
          <div class="grid gap-3 md:grid-cols-2">
            <label class="text-xs text-muted">
              Species filter
              <input
                bind:value={achievementForm.speciesFilter}
                placeholder="e.g. Bird (exact match, case-sensitive)"
                class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </label>
            <label class="text-xs text-muted">
              Color filter
              <input
                bind:value={achievementForm.colorFilter}
                placeholder="e.g. Blue, Red (comma-separated, any match)"
                class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
              />
            </label>
          </div>
        {/if}
        <div class="flex items-center gap-3">
          <button
            disabled={!achievementForm.name.trim() || !achievementForm.key.trim()}
            class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
          >
            {editingAchievementId ? 'Save changes' : 'Create achievement'}
          </button>
          {#if editingAchievementId}
            <button
              type="button"
              onclick={cancelAchievementEdit}
              class="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-primary disabled:opacity-50"
            >
              Cancel
            </button>
          {/if}
        </div>
      </form>
    </div>
  </Card>
</div>
