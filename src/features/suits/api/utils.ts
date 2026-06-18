import type { FursuitBio, FursuitConvention, FursuitMaker } from '../types';
import type { FursuitColorOption } from '../../colors';
import { normalizeSpeciesName, type FursuitSpeciesOption } from '@/features/species';
import type { ConventionLifecycleStatus } from '../../conventions';
import type { FursuitSocialLink } from '../../../types/database';

type RawSocialLink = {
  label?: unknown;
  url?: unknown;
};

type RawFursuitBio = {
  version?: unknown;
  owner_name?: unknown;
  photo_credit?: unknown;
  pronouns?: unknown;
  likes_and_interests?: unknown;
  ask_me_about?: unknown;
  social_links?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type RawColorAssignment = {
  position?: unknown;
  color?: {
    id?: unknown;
    name?: unknown;
    normalized_name?: unknown;
  } | null;
};

type RawSpeciesAssignment = {
  position?: unknown;
  species?: {
    id?: unknown;
    name?: unknown;
    normalized_name?: unknown;
  } | null;
};

type RawFursuitMaker = {
  id?: unknown;
  maker_name?: unknown;
  normalized_maker_name?: unknown;
  position?: unknown;
};

type RawFursuitConvention = {
  roster_visible?: unknown;
  roster_state?: unknown;
  convention?: {
    id?: unknown;
    slug?: unknown;
    name?: unknown;
    location?: unknown;
    start_date?: unknown;
    end_date?: unknown;
    timezone?: unknown;
    status?: unknown;
    finalizing_started_at?: unknown;
    closeout_not_before?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    geofence_radius_meters?: unknown;
    geofence_enabled?: unknown;
    location_verification_required?: unknown;
  } | null;
};

const coerceString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
};

export const parseSocialLinks = (value: unknown): FursuitSocialLink[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const { label, url } = entry as RawSocialLink;
      const normalizedLabel = coerceString(label).trim();
      const normalizedUrl = coerceString(url).trim();

      if (normalizedLabel.length === 0 || normalizedUrl.length === 0) {
        return null;
      }

      return {
        label: normalizedLabel,
        url: normalizedUrl,
      } satisfies FursuitSocialLink;
    })
    .filter(Boolean) as FursuitSocialLink[];
};

export const applyProfileSocialLinksToBio = (
  bio: FursuitBio | null,
  socialLinks: FursuitSocialLink[],
): FursuitBio | null => {
  if (bio) {
    const socialLinksToUse = socialLinks.length > 0 ? socialLinks : bio.socialLinks;

    return {
      ...bio,
      socialLinks: socialLinksToUse,
    };
  }

  if (socialLinks.length === 0) {
    return null;
  }

  return {
    version: 1,
    ownerName: '',
    photoCredit: '',
    pronouns: '',
    likesAndInterests: '',
    askMeAbout: '',
    socialLinks,
    createdAt: null,
    updatedAt: null,
  } satisfies FursuitBio;
};

export const mapFursuitBio = (raw: unknown): FursuitBio | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const source = raw as RawFursuitBio;
  const versionNumber = Number(source.version);
  const version = Number.isFinite(versionNumber) && versionNumber > 0 ? versionNumber : 1;

  const ownerName = coerceString(source.owner_name).trim();
  const photoCredit = coerceString(source.photo_credit).trim();
  const pronouns = coerceString(source.pronouns).trim();
  const likesAndInterests = coerceString(source.likes_and_interests).trim();
  const askMeAbout = coerceString(source.ask_me_about).trim();
  const socialLinks = parseSocialLinks(source.social_links);

  const createdAt = typeof source.created_at === 'string' ? source.created_at : null;
  const updatedAt = typeof source.updated_at === 'string' ? source.updated_at : null;

  if (
    !ownerName &&
    !photoCredit &&
    !pronouns &&
    !likesAndInterests &&
    !askMeAbout &&
    socialLinks.length === 0
  ) {
    return null;
  }

  return {
    version,
    ownerName,
    photoCredit,
    pronouns,
    likesAndInterests,
    askMeAbout,
    socialLinks,
    createdAt,
    updatedAt,
  } satisfies FursuitBio;
};

export const mapLatestFursuitBio = (raw: unknown): FursuitBio | null => {
  if (Array.isArray(raw)) {
    const mapped = raw
      .map((entry) => mapFursuitBio(entry))
      .filter((entry): entry is FursuitBio => Boolean(entry))
      .sort((a, b) => b.version - a.version);

    return mapped[0] ?? null;
  }

  return mapFursuitBio(raw);
};

export const mapFursuitColors = (raw: unknown): FursuitColorOption[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const mapped = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const source = entry as RawColorAssignment;
      const color = source.color ?? null;
      const id =
        color && typeof color === 'object' && typeof color.id === 'string' ? color.id : null;
      const name =
        color && typeof color === 'object' && typeof color.name === 'string' ? color.name : null;
      const normalizedName =
        color && typeof color === 'object' && typeof color.normalized_name === 'string'
          ? color.normalized_name
          : null;
      const positionNumber = Number(source.position);

      if (!id || !name) {
        return null;
      }

      return {
        option: {
          id,
          name,
          normalizedName:
            normalizedName && normalizedName.length > 0
              ? normalizedName
              : name.trim().toLowerCase(),
        } satisfies FursuitColorOption,
        order: Number.isFinite(positionNumber) ? positionNumber : Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((entry): entry is { option: FursuitColorOption; order: number } => Boolean(entry));

  return mapped
    .sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.option.name.localeCompare(b.option.name, undefined, { sensitivity: 'base' });
    })
    .map((entry) => entry.option);
};

export const mapFursuitSpecies = (
  raw: unknown,
  fallback?: { id?: string | null; name?: string | null } | null,
): FursuitSpeciesOption[] => {
  const mapped = Array.isArray(raw)
    ? raw
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const source = entry as RawSpeciesAssignment;
          const species = source.species ?? null;
          const id =
            species && typeof species === 'object' && typeof species.id === 'string'
              ? species.id
              : null;
          const name =
            species && typeof species === 'object' && typeof species.name === 'string'
              ? species.name
              : null;
          const normalizedName =
            species && typeof species === 'object' && typeof species.normalized_name === 'string'
              ? species.normalized_name
              : null;
          const positionNumber = Number(source.position);

          if (!id || !name) {
            return null;
          }

          return {
            option: {
              id,
              name,
              normalizedName:
                normalizedName && normalizedName.length > 0
                  ? normalizedName
                  : normalizeSpeciesName(name),
            } satisfies FursuitSpeciesOption,
            order: Number.isFinite(positionNumber) ? positionNumber : Number.MAX_SAFE_INTEGER,
          };
        })
        .filter((entry): entry is { option: FursuitSpeciesOption; order: number } => Boolean(entry))
    : [];

  const species = mapped
    .sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.option.name.localeCompare(b.option.name, undefined, { sensitivity: 'base' });
    })
    .map((entry) => entry.option);

  if (species.length > 0) {
    return species;
  }

  if (fallback?.id && fallback.name) {
    return [
      {
        id: fallback.id,
        name: fallback.name,
        normalizedName: normalizeSpeciesName(fallback.name),
      },
    ];
  }

  return [];
};

export const mapFursuitMakers = (raw: unknown): FursuitMaker[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const mapped = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const source = entry as RawFursuitMaker;
      const id = coerceString(source.id).trim();
      const name = coerceString(source.maker_name).trim();
      const normalizedName = coerceString(source.normalized_maker_name).trim();
      const positionNumber = Number(source.position);

      if (!id || !name || !normalizedName) {
        return null;
      }

      return {
        option: {
          id,
          name,
          normalizedName,
          position: Number.isFinite(positionNumber) ? positionNumber : Number.MAX_SAFE_INTEGER,
        } satisfies FursuitMaker,
        order: Number.isFinite(positionNumber) ? positionNumber : Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((entry): entry is { option: FursuitMaker; order: number } => Boolean(entry));

  return mapped
    .sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.option.name.localeCompare(b.option.name, undefined, { sensitivity: 'base' });
    })
    .map((entry) => entry.option);
};

const isDisplayableFursuitConventionState = (entry: RawFursuitConvention): boolean => {
  return entry.roster_state === 'active' || entry.roster_state === 'finalized';
};

const compareNullableDatesDesc = (left: string | null, right: string | null): number => {
  if (left && right) {
    return right.localeCompare(left);
  }

  if (left) return -1;
  if (right) return 1;
  return 0;
};

const asConventionLifecycleStatus = (value: unknown): ConventionLifecycleStatus | undefined => {
  return value === 'draft' ||
    value === 'scheduled' ||
    value === 'live' ||
    value === 'finalizing' ||
    value === 'closeout_running' ||
    value === 'closeout_failed' ||
    value === 'closed' ||
    value === 'archived' ||
    value === 'canceled'
    ? value
    : undefined;
};

export const mapFursuitConventionAppearances = (raw: unknown): FursuitConvention[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry): FursuitConvention | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const source = entry as RawFursuitConvention;
      const convention = source.convention ?? null;
      if (!convention || !isDisplayableFursuitConventionState(source)) {
        return null;
      }

      return {
        id: coerceString(convention.id).trim(),
        slug: coerceString(convention.slug).trim(),
        name: coerceString(convention.name).trim(),
        location: typeof convention.location === 'string' ? convention.location : null,
        start_date: typeof convention.start_date === 'string' ? convention.start_date : null,
        end_date: typeof convention.end_date === 'string' ? convention.end_date : null,
        timezone: typeof convention.timezone === 'string' ? convention.timezone : 'UTC',
        status: asConventionLifecycleStatus(convention.status),
        finalizing_started_at:
          typeof convention.finalizing_started_at === 'string'
            ? convention.finalizing_started_at
            : null,
        closeout_not_before:
          typeof convention.closeout_not_before === 'string'
            ? convention.closeout_not_before
            : null,
        latitude: typeof convention.latitude === 'number' ? convention.latitude : null,
        longitude: typeof convention.longitude === 'number' ? convention.longitude : null,
        geofence_radius_meters:
          typeof convention.geofence_radius_meters === 'number'
            ? convention.geofence_radius_meters
            : null,
        geofence_enabled: convention.geofence_enabled === true,
        location_verification_required: convention.location_verification_required === true,
        roster_visible: source.roster_visible !== false,
      } satisfies FursuitConvention;
    })
    .filter((entry): entry is FursuitConvention => Boolean(entry?.id && entry.name))
    .sort((a, b) => {
      const dateDelta = compareNullableDatesDesc(a.start_date, b.start_date);
      if (dateDelta !== 0) return dateDelta;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
};
