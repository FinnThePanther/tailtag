import { supabase } from '../../../lib/supabase';
import { emitGameplayEvent } from '../../events';
import type { FursuitSocialLink } from '../../../types/database';

export type ConventionSummary = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  status?: string;
  local_day?: string | null;
  is_joinable?: boolean;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number | null;
  geofence_enabled: boolean;
  location_verification_required: boolean;
};

export type ConventionMembershipState =
  | 'upcoming'
  | 'awaiting_start'
  | 'needs_location_verification'
  | 'active'
  | 'past';

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

export const JOINABLE_CONVENTIONS_QUERY_KEY = 'joinable-conventions';
export const CONVENTIONS_STALE_TIME = 5 * 60_000;
export const ACTIVE_PROFILE_CONVENTIONS_QUERY_KEY = 'active-profile-conventions';
export const PROFILE_CONVENTION_MEMBERSHIPS_QUERY_KEY = 'profile-convention-memberships';
export const PAST_CONVENTION_RECAPS_QUERY_KEY = 'past-convention-recaps';
export const CONVENTION_RECAP_DETAIL_QUERY_KEY = 'convention-recap-detail';

export const conventionRecapDetailQueryKey = (userId: string, recapId: string) =>
  [CONVENTION_RECAP_DETAIL_QUERY_KEY, userId, recapId] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const asString = (value: unknown, fallback = ''): string => asNullableString(value) ?? fallback;

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
        socialLinks: parseSocialLinks(entry.social_links),
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
    status: convention.status ?? undefined,
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

function mapConventionMembership(row: any): ConventionMembership {
  const membershipState =
    row.membership_state === 'upcoming' ||
    row.membership_state === 'awaiting_start' ||
    row.membership_state === 'needs_location_verification' ||
    row.membership_state === 'active' ||
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

  return mapConventionRecapDetail(data[0]);
}

export const createConventionRecapDetailQueryOptions = (userId: string, recapId: string) => ({
  queryKey: conventionRecapDetailQueryKey(userId, recapId),
  queryFn: () => fetchConventionRecapDetail(recapId),
  staleTime: CONVENTIONS_STALE_TIME,
  refetchOnWindowFocus: false,
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

export async function optOutOfConvention(profileId: string, conventionId: string): Promise<void> {
  const client = supabase as any;
  const { error } = await client.rpc('leave_convention', {
    p_profile_id: profileId,
    p_convention_id: conventionId,
  });

  if (error) {
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

export async function addFursuitConvention(fursuitId: string, conventionId: string): Promise<void> {
  const client = supabase as any;
  const { error } = await client
    .from('fursuit_conventions')
    .upsert(
      { fursuit_id: fursuitId, convention_id: conventionId },
      { onConflict: 'fursuit_id, convention_id' },
    );

  if (error) {
    throw new Error(`We couldn't add that convention to the fursuit: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  void emitGameplayEvent({
    type: 'fursuit_convention_joined',
    conventionId,
    payload: {
      fursuit_id: fursuitId,
      convention_id: conventionId,
    },
  });
}

export async function removeFursuitConvention(
  fursuitId: string,
  conventionId: string,
): Promise<void> {
  const client = supabase as any;
  const { error } = await client
    .from('fursuit_conventions')
    .delete()
    .eq('fursuit_id', fursuitId)
    .eq('convention_id', conventionId);

  if (error) {
    throw new Error(`We couldn't remove that convention from the fursuit: ${error.message}`);
  }

  // Fire-and-forget: emit event without blocking user flow
  void emitGameplayEvent({
    type: 'fursuit_convention_left',
    conventionId,
    payload: {
      fursuit_id: fursuitId,
      convention_id: conventionId,
    },
  });
}
