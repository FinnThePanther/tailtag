import type { FursuitBio } from '../types';
import type { FursuitSocialLink } from '../../../types/database';

type RawSocialLink = {
  label?: unknown;
  url?: unknown;
};

type RawFursuitBio = {
  version?: unknown;
  fursuit_name?: unknown;
  fursuit_species?: unknown;
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

const coerceString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
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

  const fursuitName = coerceString(source.fursuit_name).trim();
  const fursuitSpecies = coerceString(source.fursuit_species).trim();
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
    fursuitName,
    fursuitSpecies,
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
