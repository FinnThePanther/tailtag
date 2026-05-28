const TIKTOK_PROFILE_URL_PREFIX = 'https://www.tiktok.com/@';
const BLUESKY_PROFILE_URL_PREFIX = 'https://bsky.app/profile/';

function normalizeBlueskyActor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const decoded = decodeURIComponent(trimmed)
    .trim()
    .replace(/^@+/, '')
    .replace(/@bsky\.social$/i, '.bsky.social')
    .replace(/@bsky\.com$/i, '.bsky.social')
    .replace(/\.bluesky\.social$/i, '.bsky.social');
  const actor = decoded.split(/[\s/?#]/)[0]?.trim();
  if (!actor) return null;

  return actor.includes('.') || actor.startsWith('did:') ? actor : `${actor}.bsky.social`;
}

type NormalizeBlueskyProfileUrlOptions = {
  allowBareActor?: boolean;
};

export function normalizeBlueskyProfileUrl(
  value: string,
  options: NormalizeBlueskyProfileUrlOptions = {},
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const webProfileMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?bsky\.app\/profile\/([^/?#]+)/i,
  );
  if (webProfileMatch) {
    const rawActor = webProfileMatch[1] ?? '';
    const decodedActor = decodeURIComponent(rawActor).trim();
    const nestedProfileUrl =
      decodedActor !== rawActor ? normalizeBlueskyProfileUrl(decodedActor, options) : null;
    if (nestedProfileUrl) {
      return nestedProfileUrl;
    }

    const actor = normalizeBlueskyActor(rawActor);
    return actor ? `${BLUESKY_PROFILE_URL_PREFIX}${encodeURI(actor)}` : null;
  }

  const directHandleMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?([^/?#]+\.bsky\.social)(?:[/?#]|$)/i,
  );
  if (directHandleMatch) {
    const actor = normalizeBlueskyActor(directHandleMatch[1] ?? '');
    return actor ? `${BLUESKY_PROFILE_URL_PREFIX}${encodeURI(actor)}` : null;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return null;
  }

  if (trimmed.includes('/')) {
    return null;
  }

  if (options.allowBareActor !== true) {
    return null;
  }

  const actor = normalizeBlueskyActor(trimmed);
  return actor ? `${BLUESKY_PROFILE_URL_PREFIX}${encodeURI(actor)}` : null;
}

function normalizeTikTokHandle(value: string): string | null {
  const decoded = decodeURIComponent(value).trim().replace(/^@+/, '');
  const handle = decoded.split(/[/?#]/)[0]?.trim();
  return handle ? handle : null;
}

function buildTikTokProfileUrl(handle: string): string {
  return `${TIKTOK_PROFILE_URL_PREFIX}${encodeURIComponent(handle)}`;
}

export function normalizeSocialUrlForOpening(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  const blueskyProfileUrl = normalizeBlueskyProfileUrl(trimmed);
  if (blueskyProfileUrl) {
    return blueskyProfileUrl;
  }

  const webProfileMatch = trimmed.match(/^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@([^/?#]+)/i);
  if (webProfileMatch) {
    const handle = normalizeTikTokHandle(webProfileMatch[1] ?? '');
    return handle ? buildTikTokProfileUrl(handle) : trimmed;
  }

  const schemeProfileMatch = trimmed.match(/^tiktok:\/\/(?:user\/profile\/)?@?([^/?#]+)/i);
  if (schemeProfileMatch) {
    const handle = normalizeTikTokHandle(schemeProfileMatch[1] ?? '');
    return handle ? buildTikTokProfileUrl(handle) : trimmed;
  }

  return trimmed;
}
