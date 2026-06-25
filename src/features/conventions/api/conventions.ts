import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import { emitGameplayEvent } from '../../events';
import { captureHandledException, captureSupabaseError } from '@/lib/sentry';
import { FURSUIT_BUCKET } from '@/constants/storage';
import type { FursuitColorOption } from '@/features/colors';
import { mapFursuitColors } from '@/features/suits/api/utils';
import { resolveStorageMediaUrl } from '@/utils/supabase-image';
import type { Database, FursuitSocialLink } from '@/types/database';

const GAMEPLAY_EVENT_TIMEOUT_MS = 5000;

const createGameplayEventTimeout = (eventType: string) =>
  new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(`Gameplay event timed out after ${GAMEPLAY_EVENT_TIMEOUT_MS}ms (${eventType})`),
      );
    }, GAMEPLAY_EVENT_TIMEOUT_MS);
  });

export type ConventionSummary = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  status?: ConventionLifecycleStatus;
  finalizing_started_at: string | null;
  closeout_not_before: string | null;
  local_day?: string | null;
  is_joinable?: boolean;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number | null;
  geofence_enabled: boolean;
  location_verification_required: boolean;
};

export type ConventionLifecycleStatus =
  | 'draft'
  | 'scheduled'
  | 'live'
  | 'finalizing'
  | 'closeout_running'
  | 'closeout_failed'
  | 'closed'
  | 'archived'
  | 'canceled';

export type ConventionMembershipState =
  | 'upcoming'
  | 'awaiting_start'
  | 'needs_location_verification'
  | 'active'
  | 'leaderboard_open'
  | 'past';

export type ConventionPlayerLifecycleState =
  | ConventionMembershipState
  | 'finalizing'
  | 'recap_delayed';

export type ConventionMembership = ConventionSummary & {
  convention_id: string;
  joined_at: string;
  verification_method: string | null;
  verified_at: string | null;
  override_at: string | null;
  playable_notified_at: string | null;
  membership_state: ConventionMembershipState;
};

export type VerifiedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type OptInParams = {
  profileId: string;
  conventionId: string;
  verifiedLocation?: VerifiedLocation | null;
  verificationMethod?: 'none' | 'gps' | 'manual_override' | 'grandfathered';
  overrideReason?: string | null;
};

export type VerifyAndOptInParams = {
  profileId: string;
  conventionId: string;
  verifiedLocation: VerifiedLocation;
};

export type ConventionVerificationErrorCode =
  | 'convention_not_found'
  | 'profile_not_found'
  | 'registration_closed'
  | 'geofence_not_configured'
  | 'location_required'
  | 'rate_limited'
  | 'poor_accuracy'
  | 'outside_geofence'
  | 'unknown';

export type VerifyAndOptInToConventionResponse = {
  verified: boolean;
  requires_location_verification: boolean;
  distance_meters: number | null;
  geofence_radius_meters: number | null;
  effective_radius_meters: number | null;
  error_code: ConventionVerificationErrorCode | null;
  error: string | null;
};

export type PastConventionRecap = {
  recapId: string;
  conventionId: string;
  conventionName: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  generatedAt: string;
  finalRank: number | null;
  catchCount: number;
  uniqueFursuitsCaughtCount: number;
  ownFursuitsCaughtCount: number;
  uniqueCatchersForOwnFursuitsCount: number;
  dailyTasksCompletedCount: number;
  achievementsUnlockedCount: number;
  summary: Record<string, unknown>;
};

export type PastConventionRecapSummaryCaughtFursuit = {
  fursuitId: string;
  name: string | null;
  catchCount: number;
};

export type PastConventionRecapSummaryOwnedFursuit = {
  fursuitId: string;
  name: string | null;
  timesCaught: number;
  uniqueCatchers: number;
};

export type PastConventionRecapSummary = {
  fursuitsCaught: PastConventionRecapSummaryCaughtFursuit[];
  ownFursuits: PastConventionRecapSummaryOwnedFursuit[];
  achievementIds: string[];
  dailyTaskDaysCompleted: number;
};

export type ConventionRecapHeader = {
  recapId: string;
  conventionId: string;
  conventionName: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  generatedAt: string;
  joinedAt: string | null;
  leftAt: string | null;
  finalRank: number | null;
  catchCount: number;
  uniqueFursuitsCaughtCount: number;
  ownFursuitsCaughtCount: number;
  uniqueCatchersForOwnFursuitsCount: number;
  dailyTasksCompletedCount: number;
  achievementsUnlockedCount: number;
};

export type ConventionRecapCaughtFursuit = {
  fursuitId: string;
  isRedacted: boolean;
  name: string | null;
  catchCount: number;
  firstCaughtAt: string | null;
  mostRecentCaughtAt: string | null;
  avatarUrl: string | null;
  species: string | null;
  colors: string[];
  ownerId: string | null;
  ownerUsername: string | null;
  ownerName: string | null;
  pronouns: string | null;
  askMeAbout: string | null;
  likesAndInterests: string | null;
  socialLinks: FursuitSocialLink[];
};

export type ConventionRecapOwnedFursuit = {
  fursuitId: string;
  isRedacted: boolean;
  name: string | null;
  timesCaught: number;
  uniqueCatchers: number;
  firstCaughtAt: string | null;
  mostRecentCaughtAt: string | null;
  avatarUrl: string | null;
  species: string | null;
  colors: string[];
};

export type ConventionRecapAchievement = {
  achievementId: string;
  key: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  unlockedAt: string | null;
};

export type ConventionRecapDailySummary = {
  completedTasksCount: number;
  completedDaysCount: number;
  completedDays: string[];
  conventionTotalDays: number | null;
};

export type ConventionRecapAward = {
  code: string;
  title: string;
  description: string;
};

export type ConventionRecapDetail = {
  recap: ConventionRecapHeader;
  caughtFursuits: ConventionRecapCaughtFursuit[];
  ownedFursuits: ConventionRecapOwnedFursuit[];
  achievements: ConventionRecapAchievement[];
  dailySummary: ConventionRecapDailySummary;
  awards: ConventionRecapAward[];
};

export type FursuitConventionRosterSettings = {
  rosterVisible: boolean;
};

export type ConventionSuitRosterEntry = {
  fursuitId: string;
  conventionId: string;
  name: string;
  species: string | null;
  speciesId: string | null;
  colors: FursuitColorOption[];
  avatarUrl: string | null;
  ownerProfileId: string | null;
  ownerUsername: string | null;
  rosterVisible: boolean;
  conventionCatchCount: number;
};

export type ConventionSuitRosterViewEntry = ConventionSuitRosterEntry & {
  caughtByCurrentUser: boolean;
};

export const JOINABLE_CONVENTIONS_QUERY_KEY = 'joinable-conventions';
export const CONVENTIONS_STALE_TIME = 5 * 60_000;
export const ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY = 'active-profile-conventions';
export const PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY = 'profile-convention-memberships';
export const PAST_CONVENTION_RECAPS_QUERY_KEY = 'past-convention-recaps';
export const CONVENTION_RECAP_DETAIL_QUERY_KEY = 'convention-recap-detail';
export const CONVENTION_SUIT_ROSTER_QUERY_KEY = 'convention-suit-roster';
export const CONVENTION_SUIT_ROSTER_CAUGHT_IDS_QUERY_KEY = 'convention-suit-roster-caught-ids';

export const conventionRecapDetailQueryKey = (userId: string, recapId: string) =>
  [CONVENTION_RECAP_DETAIL_QUERY_KEY, userId, recapId] as const;

export const conventionSuitRosterQueryKey = (userId: string, conventionId: string) =>
  [CONVENTION_SUIT_ROSTER_QUERY_KEY, userId, conventionId] as const;

export const conventionSuitRosterCaughtIdsQueryKey = (userId: string, conventionId: string) =>
  [CONVENTION_SUIT_ROSTER_CAUGHT_IDS_QUERY_KEY, userId, conventionId] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const asString = (value: unknown, fallback = ''): string => asNullableString(value) ?? fallback;

const isConventionLifecycleStatus = (value: unknown): value is ConventionLifecycleStatus =>
  value === 'draft' ||
  value === 'scheduled' ||
  value === 'live' ||
  value === 'finalizing' ||
  value === 'closeout_running' ||
  value === 'closeout_failed' ||
  value === 'closed' ||
  value === 'archived' ||
  value === 'canceled';

const asConventionLifecycleStatus = (value: unknown): ConventionLifecycleStatus | undefined =>
  isConventionLifecycleStatus(value) ? value : undefined;

const asNonNegativeInteger = (value: unknown): number => {
  const normalized =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.trunc(normalized));
};

const asPositiveIntegerOrNull = (value: unknown): number | null => {
  const normalized =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(normalized)) return null;
  const integer = Math.trunc(normalized);
  return integer > 0 ? integer : null;
};

const asNumberOrNull = (value: unknown): number | null => {
  const normalized =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(normalized) ? normalized : null;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asNullableString(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const asRecordArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
};

const parseSocialLinks = (value: unknown): FursuitSocialLink[] => {
  return asRecordArray(value)
    .map((entry) => {
      const label = asNullableString(entry.label);
      const url = asNullableString(entry.url);
      if (!label || !url) return null;

      return {
        label,
        url,
      } satisfies FursuitSocialLink;
    })
    .filter((entry): entry is FursuitSocialLink => Boolean(entry));
};

function mapConventionRecapHeader(raw: unknown): ConventionRecapHeader {
  const source = isRecord(raw) ? raw : {};

  return {
    recapId: asString(source.recap_id),
    conventionId: asString(source.convention_id),
    conventionName: asString(source.convention_name),
    location: asNullableString(source.location),
    startDate: asNullableString(source.start_date),
    endDate: asNullableString(source.end_date),
    generatedAt: asString(source.generated_at),
    joinedAt: asNullableString(source.joined_at),
    leftAt: asNullableString(source.left_at),
    finalRank: asPositiveIntegerOrNull(source.final_rank),
    catchCount: asNonNegativeInteger(source.catch_count),
    uniqueFursuitsCaughtCount: asNonNegativeInteger(source.unique_fursuits_caught_count),
    ownFursuitsCaughtCount: asNonNegativeInteger(source.own_fursuits_caught_count),
    uniqueCatchersForOwnFursuitsCount: asNonNegativeInteger(
      source.unique_catchers_for_own_fursuits_count,
    ),
    dailyTasksCompletedCount: asNonNegativeInteger(source.daily_tasks_completed_count),
    achievementsUnlockedCount: asNonNegativeInteger(source.achievements_unlocked_count),
  };
}

function mapConventionRecapCaughtFursuits(raw: unknown): ConventionRecapCaughtFursuit[] {
  return asRecordArray(raw)
    .map((entry) => {
      const fursuitId = asNullableString(entry.fursuit_id);
      if (!fursuitId) return null;

      return {
        fursuitId,
        isRedacted: entry.is_redacted === true,
        name: asNullableString(entry.name),
        catchCount: asNonNegativeInteger(entry.catch_count),
        firstCaughtAt: asNullableString(entry.first_caught_at),
        mostRecentCaughtAt: asNullableString(entry.most_recent_caught_at),
        avatarUrl: asNullableString(entry.avatar_url),
        species: asNullableString(entry.species),
        colors: asStringArray(entry.colors),
        ownerId: asNullableString(entry.owner_id),
        ownerUsername: asNullableString(entry.owner_username),
        ownerName: asNullableString(entry.owner_name),
        pronouns: asNullableString(entry.pronouns),
        askMeAbout: asNullableString(entry.ask_me_about),
        likesAndInterests: asNullableString(entry.likes_and_interests),
        socialLinks: [] as FursuitSocialLink[],
      } satisfies ConventionRecapCaughtFursuit;
    })
    .filter((entry): entry is ConventionRecapCaughtFursuit => Boolean(entry));
}

function mapConventionRecapOwnedFursuits(raw: unknown): ConventionRecapOwnedFursuit[] {
  return asRecordArray(raw)
    .map((entry) => {
      const fursuitId = asNullableString(entry.fursuit_id);
      if (!fursuitId) return null;

      return {
        fursuitId,
        isRedacted: entry.is_redacted === true,
        name: asNullableString(entry.name),
        timesCaught: asNonNegativeInteger(entry.times_caught),
        uniqueCatchers: asNonNegativeInteger(entry.unique_catchers),
        firstCaughtAt: asNullableString(entry.first_caught_at),
        mostRecentCaughtAt: asNullableString(entry.most_recent_caught_at),
        avatarUrl: asNullableString(entry.avatar_url),
        species: asNullableString(entry.species),
        colors: asStringArray(entry.colors),
      } satisfies ConventionRecapOwnedFursuit;
    })
    .filter((entry): entry is ConventionRecapOwnedFursuit => Boolean(entry));
}

function mapConventionRecapAchievements(raw: unknown): ConventionRecapAchievement[] {
  return asRecordArray(raw)
    .map((entry) => {
      const achievementId = asNullableString(entry.achievement_id);
      if (!achievementId) return null;

      return {
        achievementId,
        key: asNullableString(entry.key),
        name: asNullableString(entry.name),
        description: asNullableString(entry.description),
        category: asNullableString(entry.category),
        unlockedAt: asNullableString(entry.unlocked_at),
      } satisfies ConventionRecapAchievement;
    })
    .filter((entry): entry is ConventionRecapAchievement => Boolean(entry));
}

function mapConventionRecapDailySummary(raw: unknown): ConventionRecapDailySummary {
  const source = isRecord(raw) ? raw : {};
  const conventionTotalDays =
    source.convention_total_days === null
      ? null
      : asPositiveIntegerOrNull(source.convention_total_days);

  return {
    completedTasksCount: asNonNegativeInteger(source.completed_tasks_count),
    completedDaysCount: asNonNegativeInteger(source.completed_days_count),
    completedDays: asStringArray(source.completed_days),
    conventionTotalDays,
  };
}

function mapConventionRecapAwards(raw: unknown): ConventionRecapAward[] {
  return asRecordArray(raw)
    .map((entry) => {
      const code = asNullableString(entry.code);
      const title = asNullableString(entry.title);
      const description = asNullableString(entry.description);

      if (!code || !title || !description) {
        return null;
      }

      return {
        code,
        title,
        description,
      } satisfies ConventionRecapAward;
    })
    .filter((entry): entry is ConventionRecapAward => Boolean(entry));
}

function mapConventionRecapDetail(raw: unknown): ConventionRecapDetail {
  const source = isRecord(raw) ? raw : {};

  return {
    recap: mapConventionRecapHeader(source.recap),
    caughtFursuits: mapConventionRecapCaughtFursuits(source.caught_fursuits),
    ownedFursuits: mapConventionRecapOwnedFursuits(source.owned_fursuits),
    achievements: mapConventionRecapAchievements(source.achievements),
    dailySummary: mapConventionRecapDailySummary(source.daily_summary),
    awards: mapConventionRecapAwards(source.awards),
  };
}

async function applyProfileSocialLinksToConventionRecapDetail(
  detail: ConventionRecapDetail,
): Promise<ConventionRecapDetail> {
  const fursuitIds = detail.caughtFursuits
    .filter((fursuit) => !fursuit.isRedacted)
    .map((fursuit) => fursuit.fursuitId);

  if (fursuitIds.length === 0) {
    return detail;
  }

  const client = supabase as any;
  const { data: fursuits, error: fursuitsError } = await client
    .from('fursuits')
    .select('id, owner_attribution_visibility')
    .in('id', fursuitIds);

  if (fursuitsError) {
    captureSupabaseError(fursuitsError, {
      scope: 'conventions.applyProfileSocialLinksToConventionRecapDetail.fursuits',
    });
    return detail;
  }

  const hiddenFursuitIds = new Set<string>();
  for (const fursuit of fursuits ?? []) {
    if (fursuit?.id && fursuit.owner_attribution_visibility === 'hidden') {
      hiddenFursuitIds.add(fursuit.id);
    }
  }

  const ownerIds = Array.from(
    new Set(
      detail.caughtFursuits
        .filter((fursuit) => !fursuit.isRedacted && !hiddenFursuitIds.has(fursuit.fursuitId))
        .map((fursuit) => fursuit.ownerId)
        .filter((ownerId): ownerId is string => Boolean(ownerId)),
    ),
  );

  if (ownerIds.length === 0) {
    return detail;
  }

  const { data, error } = await client
    .from('profiles')
    .select('id, social_links')
    .in('id', ownerIds);

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.applyProfileSocialLinksToConventionRecapDetail',
    });
    return detail;
  }

  const socialLinksByOwnerId = new Map<string, FursuitSocialLink[]>();
  for (const profile of data ?? []) {
    if (!profile?.id) continue;
    socialLinksByOwnerId.set(profile.id, parseSocialLinks(profile.social_links));
  }

  return {
    ...detail,
    caughtFursuits: detail.caughtFursuits.map((fursuit) => ({
      ...fursuit,
      socialLinks:
        !fursuit.isRedacted && !hiddenFursuitIds.has(fursuit.fursuitId) && fursuit.ownerId
          ? (socialLinksByOwnerId.get(fursuit.ownerId) ?? [])
          : [],
    })),
  };
}

export function parsePastConventionRecapSummary(
  summary: Record<string, unknown>,
): PastConventionRecapSummary {
  const fursuitsCaught = asRecordArray(summary.fursuits_caught)
    .map((entry) => {
      const fursuitId = asNullableString(entry.fursuit_id);
      if (!fursuitId) return null;

      return {
        fursuitId,
        name: asNullableString(entry.name),
        catchCount: asNonNegativeInteger(entry.catch_count),
      } satisfies PastConventionRecapSummaryCaughtFursuit;
    })
    .filter((entry): entry is PastConventionRecapSummaryCaughtFursuit => Boolean(entry));

  const ownFursuits = asRecordArray(summary.own_fursuits)
    .map((entry) => {
      const fursuitId = asNullableString(entry.fursuit_id);
      if (!fursuitId) return null;

      return {
        fursuitId,
        name: asNullableString(entry.name),
        timesCaught: asNonNegativeInteger(entry.times_caught),
        uniqueCatchers: asNonNegativeInteger(entry.unique_catchers),
      } satisfies PastConventionRecapSummaryOwnedFursuit;
    })
    .filter((entry): entry is PastConventionRecapSummaryOwnedFursuit => Boolean(entry));

  const achievementIds = Array.from(new Set(asStringArray(summary.achievement_ids)));

  return {
    fursuitsCaught,
    ownFursuits,
    achievementIds,
    dailyTaskDaysCompleted: asNonNegativeInteger(summary.daily_task_days_completed),
  };
}

function mapConventionSummary(convention: any): ConventionSummary {
  return {
    id: convention.id,
    slug: convention.slug,
    name: convention.name,
    location: convention.location ?? null,
    start_date: convention.start_date ?? null,
    end_date: convention.end_date ?? null,
    timezone: convention.timezone ?? 'UTC',
    status: asConventionLifecycleStatus(convention.status),
    finalizing_started_at: convention.finalizing_started_at ?? null,
    closeout_not_before: convention.closeout_not_before ?? null,
    local_day: convention.local_day ?? null,
    is_joinable: typeof convention.is_joinable === 'boolean' ? convention.is_joinable : undefined,
    latitude:
      convention.latitude === null || convention.latitude === undefined
        ? null
        : Number(convention.latitude),
    longitude:
      convention.longitude === null || convention.longitude === undefined
        ? null
        : Number(convention.longitude),
    geofence_radius_meters: convention.geofence_radius_meters ?? null,
    geofence_enabled: Boolean(convention.geofence_enabled),
    location_verification_required: Boolean(convention.location_verification_required),
  };
}

export function getConventionPlayerLifecycleState(
  membership: Pick<ConventionMembership, 'status' | 'membership_state'>,
): ConventionPlayerLifecycleState {
  if (membership.status === 'finalizing') {
    return 'finalizing';
  }

  if (membership.status === 'closeout_running' || membership.status === 'closeout_failed') {
    return 'recap_delayed';
  }

  if (
    membership.status === 'closed' ||
    membership.status === 'archived' ||
    membership.status === 'canceled'
  ) {
    return 'past';
  }

  return membership.membership_state;
}

export function formatConventionCloseoutDeadline(
  closeoutNotBefore: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!closeoutNotBefore) {
    return null;
  }

  const parsed = new Date(closeoutNotBefore);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const formatOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone || 'UTC',
  };

  try {
    return new Intl.DateTimeFormat('en-US', formatOptions).format(parsed);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      ...formatOptions,
      timeZone: 'UTC',
    }).format(parsed);
  }
}

function mapConventionMembership(row: any): ConventionMembership {
  const membershipState =
    row.membership_state === 'upcoming' ||
    row.membership_state === 'awaiting_start' ||
    row.membership_state === 'needs_location_verification' ||
    row.membership_state === 'active' ||
    row.membership_state === 'leaderboard_open' ||
    row.membership_state === 'past'
      ? row.membership_state
      : 'upcoming';

  return {
    ...mapConventionSummary(row),
    convention_id: row.convention_id ?? row.id,
    joined_at: row.joined_at,
    verification_method: row.verification_method ?? null,
    verified_at: row.verified_at ?? null,
    override_at: row.override_at ?? null,
    playable_notified_at: row.playable_notified_at ?? null,
    membership_state: membershipState,
  };
}

function mapPastConventionRecap(row: any): PastConventionRecap {
  return {
    recapId: row.recap_id,
    conventionId: row.convention_id,
    conventionName: row.convention_name,
    location: row.location ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    generatedAt: row.generated_at,
    finalRank: row.final_rank ?? null,
    catchCount: Number(row.catch_count ?? 0),
    uniqueFursuitsCaughtCount: Number(row.unique_fursuits_caught_count ?? 0),
    ownFursuitsCaughtCount: Number(row.own_fursuits_caught_count ?? 0),
    uniqueCatchersForOwnFursuitsCount: Number(row.unique_catchers_for_own_fursuits_count ?? 0),
    dailyTasksCompletedCount: Number(row.daily_tasks_completed_count ?? 0),
    achievementsUnlockedCount: Number(row.achievements_unlocked_count ?? 0),
    summary: isRecord(row.summary) ? (row.summary as Record<string, unknown>) : {},
  };
}

export async function fetchJoinableConventions(): Promise<ConventionSummary[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_joinable_conventions');

  if (error) {
    throw new Error(`We couldn't load conventions: ${error.message}`);
  }

  return (data ?? []).map(mapConventionSummary);
}

export const createJoinableConventionsQueryOptions = () => ({
  queryKey: [JOINABLE_CONVENTIONS_QUERY_KEY],
  queryFn: () => fetchJoinableConventions(),
  staleTime: CONVENTIONS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export async function fetchPastConventionRecaps(): Promise<PastConventionRecap[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_my_convention_recaps');

  if (error) {
    throw new Error(`We couldn't load your past conventions: ${error.message}`);
  }

  return (data ?? []).map(mapPastConventionRecap);
}

export async function fetchConventionRecapDetail(
  recapId: string,
): Promise<ConventionRecapDetail | null> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_my_convention_recap_detail', {
    p_recap_id: recapId,
  });

  if (error) {
    throw new Error(`We couldn't load that convention recap: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return applyProfileSocialLinksToConventionRecapDetail(mapConventionRecapDetail(data[0]));
}

export const createConventionRecapDetailQueryOptions = (userId: string, recapId: string) => ({
  queryKey: conventionRecapDetailQueryKey(userId, recapId),
  queryFn: () => fetchConventionRecapDetail(recapId),
  staleTime: CONVENTIONS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export async function fetchConventionSuitRoster(
  conventionId: string,
): Promise<ConventionSuitRosterEntry[]> {
  const client = supabase as SupabaseClient<Database>;
  const { data, error } = await client.rpc('get_convention_suit_roster', {
    p_convention_id: conventionId,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.fetchConventionSuitRoster',
      conventionId,
    });
    throw new Error(`We couldn't load the fursuit roster: ${error.message}`);
  }

  type RosterRow = Database['public']['Functions']['get_convention_suit_roster']['Returns'][number];

  return (data ?? [])
    .filter((row: RosterRow) => row.fursuit_id != null)
    .map((row: RosterRow) => ({
      fursuitId: row.fursuit_id,
      conventionId: row.convention_id ?? conventionId,
      name: row.fursuit_name ?? 'Unknown suit',
      species: row.species_name ?? null,
      speciesId: row.species_id ?? null,
      colors: mapFursuitColors(row.color_assignments),
      avatarUrl: resolveStorageMediaUrl({
        bucket: FURSUIT_BUCKET,
        path: row.fursuit_avatar_path ?? null,
        legacyUrl: row.fursuit_avatar_url ?? null,
      }),
      ownerProfileId: row.owner_id ?? null,
      ownerUsername: row.owner_username ?? null,
      rosterVisible: row.roster_visible !== false,
      conventionCatchCount: Number(row.convention_catch_count ?? 0),
    }));
}

export const createConventionSuitRosterQueryOptions = (userId: string, conventionId: string) => ({
  queryKey: conventionSuitRosterQueryKey(userId, conventionId),
  queryFn: () => fetchConventionSuitRoster(conventionId),
  staleTime: CONVENTIONS_STALE_TIME,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export async function fetchConventionSuitRosterCaughtIds(
  conventionId: string,
): Promise<Set<string>> {
  const client = supabase as SupabaseClient<Database>;
  const { data, error } = await client.rpc('get_convention_suit_roster_caught_ids', {
    p_convention_id: conventionId,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.fetchConventionSuitRosterCaughtIds',
      conventionId,
    });
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.fursuit_id).filter(Boolean));
}

export const createConventionSuitRosterCaughtIdsQueryOptions = (
  userId: string,
  conventionId: string,
) => ({
  queryKey: conventionSuitRosterCaughtIdsQueryKey(userId, conventionId),
  queryFn: () => fetchConventionSuitRosterCaughtIds(conventionId),
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: false,
});

export async function fetchActiveProfileConventionIds(profileId: string): Promise<string[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_active_profile_convention_ids', {
    p_profile_id: profileId,
  });

  if (error) {
    throw new Error(`We couldn't load your playable conventions: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.convention_id);
}

export async function fetchProfileConventionMemberships(): Promise<ConventionMembership[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_my_convention_memberships');

  if (error) {
    throw new Error(`We couldn't load your conventions: ${error.message}`);
  }

  return (data ?? []).map(mapConventionMembership);
}

export async function fetchActiveSharedConventionIds(
  profileId: string,
  fursuitId: string,
): Promise<string[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_active_shared_convention_ids', {
    p_profile_id: profileId,
    p_fursuit_id: fursuitId,
  });

  if (error) {
    throw new Error(`We couldn't resolve your playable shared conventions: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.convention_id);
}

export async function fetchGalleryProfileConventionIds(profileId: string): Promise<string[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_gallery_profile_convention_ids', {
    p_profile_id: profileId,
  });

  if (error) {
    throw new Error(`We couldn't load your gallery-eligible conventions: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.convention_id);
}

export async function fetchGallerySharedConventionIds(
  profileId: string,
  fursuitId: string,
): Promise<string[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc('get_gallery_shared_convention_ids', {
    p_profile_id: profileId,
    p_fursuit_id: fursuitId,
  });

  if (error) {
    throw new Error(
      `We couldn't resolve your gallery-eligible shared conventions: ${error.message}`,
    );
  }

  return (data ?? []).map((row: any) => row.convention_id);
}

export async function optInToConvention(params: OptInParams): Promise<void> {
  const {
    profileId,
    conventionId,
    verifiedLocation = null,
    verificationMethod = verifiedLocation ? 'gps' : 'none',
    overrideReason = null,
  } = params;

  const client = supabase as any;
  const { error } = await client.rpc('opt_in_to_convention', {
    p_profile_id: profileId,
    p_convention_id: conventionId,
    p_verified_location: verifiedLocation
      ? {
          lat: verifiedLocation.latitude,
          lng: verifiedLocation.longitude,
          accuracy: verifiedLocation.accuracy,
        }
      : null,
    p_verification_method: verificationMethod,
    p_override_reason: overrideReason,
  });

  if (error) {
    throw new Error(`We couldn't save your convention opt-in: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  void emitGameplayEvent({
    type: 'convention_joined',
    conventionId,
    payload: {
      profile_id: profileId,
      convention_id: conventionId,
      verification_method: verificationMethod,
    },
  });
}

const normalizeConventionVerificationErrorCode = (
  value: unknown,
): ConventionVerificationErrorCode | null => {
  if (
    value === 'convention_not_found' ||
    value === 'profile_not_found' ||
    value === 'registration_closed' ||
    value === 'geofence_not_configured' ||
    value === 'location_required' ||
    value === 'rate_limited' ||
    value === 'poor_accuracy' ||
    value === 'outside_geofence' ||
    value === 'unknown'
  ) {
    return value;
  }

  return value ? 'unknown' : null;
};

function mapVerifyAndOptInResponse(raw: unknown): VerifyAndOptInToConventionResponse {
  const source = isRecord(raw) ? raw : {};

  return {
    verified: source.verified === true,
    requires_location_verification: source.requires_location_verification === true,
    distance_meters: asNumberOrNull(source.distance_meters),
    geofence_radius_meters: asNumberOrNull(source.geofence_radius_meters),
    effective_radius_meters: asNumberOrNull(source.effective_radius_meters),
    error_code: normalizeConventionVerificationErrorCode(source.error_code),
    error: asNullableString(source.error),
  };
}

export async function verifyAndOptInToConvention(
  params: VerifyAndOptInParams,
): Promise<VerifyAndOptInToConventionResponse> {
  const client = supabase as any;
  const { data, error } = await client.rpc('verify_and_opt_in_to_convention', {
    p_profile_id: params.profileId,
    p_convention_id: params.conventionId,
    p_verified_location: {
      lat: params.verifiedLocation.latitude,
      lng: params.verifiedLocation.longitude,
      accuracy: params.verifiedLocation.accuracy,
    },
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.verifyAndOptInToConvention',
      profileId: params.profileId,
      conventionId: params.conventionId,
    });
    throw new Error(`We couldn't verify your convention location: ${error.message}`);
  }

  const result = mapVerifyAndOptInResponse(data);

  if (result.verified) {
    const eventType = 'convention_joined';
    void Promise.race([
      emitGameplayEvent({
        type: eventType,
        conventionId: params.conventionId,
        payload: {
          profile_id: params.profileId,
          convention_id: params.conventionId,
          verification_method: result.requires_location_verification ? 'gps' : 'none',
        },
      }),
      createGameplayEventTimeout(eventType),
    ]).catch((eventError) => {
      captureHandledException(eventError, {
        scope: 'conventions.verifyAndOptInToConvention.event',
        eventType,
        profileId: params.profileId,
        conventionId: params.conventionId,
      });
    });
  }

  return result;
}

export async function optOutOfConvention(profileId: string, conventionId: string): Promise<void> {
  const client = supabase as any;
  const { error } = await client.rpc('leave_convention', {
    p_profile_id: profileId,
    p_convention_id: conventionId,
  });

  if (error) {
    captureSupabaseError(error);
    throw new Error(`We couldn't update your convention attendance: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  void emitGameplayEvent({
    type: 'convention_left',
    conventionId,
    payload: {
      profile_id: profileId,
      convention_id: conventionId,
    },
  });
}

export async function addFursuitConvention(
  fursuitId: string,
  conventionId: string,
  settings: FursuitConventionRosterSettings = {
    rosterVisible: true,
  },
): Promise<void> {
  const client = supabase as SupabaseClient<Database>;
  const rosterVisible = settings.rosterVisible !== false;
  const { error } = await client.from('fursuit_conventions').upsert(
    {
      fursuit_id: fursuitId,
      convention_id: conventionId,
      roster_visible: rosterVisible,
      roster_state: 'active',
      removed_at: null,
      active_until: null,
      finalized_at: null,
    },
    { onConflict: 'fursuit_id, convention_id' },
  );

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.addFursuitConvention',
      fursuitId,
      conventionId,
    });
    throw new Error(`We couldn't add that convention to the fursuit: ${error.message}`);
  }

  const eventType = 'fursuit_convention_joined';
  // Fire-and-forget: emit event without blocking user flow
  void Promise.race([
    emitGameplayEvent({
      type: eventType,
      conventionId,
      payload: {
        fursuit_id: fursuitId,
        convention_id: conventionId,
      },
    }),
    createGameplayEventTimeout(eventType),
  ]).catch((eventError) => {
    captureHandledException(eventError, {
      scope: 'conventions.addFursuitConvention.event',
      eventType,
      fursuitId,
      conventionId,
    });
  });
}

export async function removeFursuitConvention(
  fursuitId: string,
  conventionId: string,
): Promise<void> {
  const client = supabase as SupabaseClient<Database>;
  const { error } = await client.rpc('remove_fursuit_from_convention', {
    p_fursuit_id: fursuitId,
    p_convention_id: conventionId,
  });

  if (error) {
    captureSupabaseError(error, {
      scope: 'conventions.removeFursuitConvention',
      fursuitId,
      conventionId,
    });
    throw new Error(`We couldn't remove that convention from the fursuit: ${error.message}`);
  }

  const eventType = 'fursuit_convention_left';
  // Fire-and-forget: emit event without blocking user flow
  void Promise.race([
    emitGameplayEvent({
      type: eventType,
      conventionId,
      payload: {
        fursuit_id: fursuitId,
        convention_id: conventionId,
      },
    }),
    createGameplayEventTimeout(eventType),
  ]).catch((eventError) => {
    captureHandledException(eventError, {
      scope: 'conventions.removeFursuitConvention.event',
      eventType,
      fursuitId,
      conventionId,
    });
  });
}
