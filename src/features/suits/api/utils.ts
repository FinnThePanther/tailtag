import type { FursuitBio } from '../types';
import type { FursuitColorOption } from '../../colors';
import type { FursuitSocialLink } from '../../../types/database';

type RawSocialLink = {
  label?: unknown;
  url?: unknown;
};

type RawFursuitBio = {
  version?: unknown;
  owner_name?: unknown;
  pronouns?: unknown;
  tagline?: unknown;
  fun_fact?: unknown;
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

const coerceString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
};

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => coerceString(entry).trim())
    .filter((entry) => entry.length > 0);
};

const parseSocialLinks = (value: unknown): FursuitSocialLink[] => {
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

export const mapFursuitBio = (raw: unknown): FursuitBio | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const source = raw as RawFursuitBio;
  const versionNumber = Number(source.version);
  const version = Number.isFinite(versionNumber) && versionNumber > 0 ? versionNumber : 1;

  const ownerName = coerceString(source.owner_name).trim();
  const pronouns = coerceString(source.pronouns).trim();
  const tagline = coerceString(source.tagline).trim();
  const funFact = coerceString(source.fun_fact).trim();
  const likesAndInterests = coerceString(source.likes_and_interests).trim();
  const askMeAbout = coerceString(source.ask_me_about).trim();
  const socialLinks = parseSocialLinks(source.social_links);

  const createdAt = typeof source.created_at === 'string' ? source.created_at : null;
  const updatedAt = typeof source.updated_at === 'string' ? source.updated_at : null;

  if (
    !ownerName &&
    !pronouns &&
    !tagline &&
    !funFact &&
    !likesAndInterests &&
    !askMeAbout &&
    socialLinks.length === 0
  ) {
    return null;
  }

  return {
    version,
    ownerName,
    pronouns,
    tagline,
    funFact,
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
      const id = color && typeof color === 'object' && typeof color.id === 'string' ? color.id : null;
      const name =
        color && typeof color === 'object' && typeof color.name === 'string'
          ? color.name
          : null;
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
