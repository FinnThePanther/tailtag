import { normalizeBlueskyProfileUrl, normalizeSocialUrlForOpening } from '@/utils/socialLinks';

export type HandleFormat = 'strip_at' | 'add_at' | 'as_is';

export type SocialPlatform = {
  id: string;
  label: string;
  urlTemplate: string;
  handleFormat: HandleFormat;
  handlePlaceholder: string;
};

export const ALLOWED_SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: 'twitter',
    label: 'X (Twitter)',
    urlTemplate: 'https://x.com/{handle}',
    handleFormat: 'strip_at',
    handlePlaceholder: 'Handle',
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    urlTemplate: 'https://bsky.app/profile/{handle}',
    handleFormat: 'strip_at',
    handlePlaceholder: 'name.bsky.social or @name',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    urlTemplate: 'https://instagram.com/{handle}',
    handleFormat: 'strip_at',
    handlePlaceholder: 'Handle',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    urlTemplate: 'https://www.tiktok.com/@{handle}',
    handleFormat: 'strip_at',
    handlePlaceholder: 'Handle',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    urlTemplate: 'https://t.me/{handle}',
    handleFormat: 'strip_at',
    handlePlaceholder: 'Handle',
  },
  {
    id: 'discord',
    label: 'Discord',
    urlTemplate: 'https://discord.com/users/{handle}',
    handleFormat: 'strip_at',
    handlePlaceholder: 'User ID',
  },
];

export const CUSTOM_PLATFORM_ID = 'custom';

export type EditableSocialLink = {
  id: string;
  platformId: string;
  handle: string;
  /** For custom links only */
  label?: string;
  /** For custom links only */
  url?: string;
};

export const SOCIAL_LINK_LIMIT = 5;

function safelyDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeHandle(handle: string, format: HandleFormat): string {
  const trimmed = handle.trim();
  if (!trimmed) return '';

  switch (format) {
    case 'strip_at':
      return trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed;
    case 'add_at':
      return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    case 'as_is':
    default:
      return trimmed;
  }
}

export function buildSocialUrl(
  platformId: string,
  handle: string,
): { label: string; url: string } | null {
  const platform = ALLOWED_SOCIAL_PLATFORMS.find((p) => p.id === platformId);
  if (!platform) return null;

  const normalized = normalizeHandle(handle, platform.handleFormat);
  if (!normalized) return null;

  if (platform.id === 'bluesky') {
    const url = normalizeBlueskyProfileUrl(normalized, { allowBareActor: true });
    return url ? { label: platform.label, url } : null;
  }

  const url = platform.urlTemplate.replace('{handle}', encodeURIComponent(normalized));
  return { label: platform.label, url };
}

const PLATFORM_URL_PATTERNS: {
  platformId: string;
  regex: RegExp;
  extractGroup: number;
}[] = [
  {
    platformId: 'twitter',
    regex: /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([^/?#]+)/i,
    extractGroup: 1,
  },
  {
    platformId: 'bluesky',
    regex:
      /^https?:\/\/(?:www\.)?(?:bsky\.app\/profile\/([^/?#]+)|([^/?#]+\.bsky\.social)(?:[/?#]|$))/i,
    extractGroup: 1,
  },
  {
    platformId: 'instagram',
    regex: /^https?:\/\/(?:www\.)?instagram\.com\/([^/?#]+)/i,
    extractGroup: 1,
  },
  {
    platformId: 'tiktok',
    regex: /^https?:\/\/(?:www\.)?tiktok\.com\/@?([^/?#]+)/i,
    extractGroup: 1,
  },
  {
    platformId: 'telegram',
    regex: /^https?:\/\/(?:t\.me|telegram\.me)\/([^/?#]+)/i,
    extractGroup: 1,
  },
  {
    platformId: 'discord',
    regex: /^https?:\/\/(?:www\.)?(?:discord\.com|discordapp\.com)\/users\/([^/?#]+)/i,
    extractGroup: 1,
  },
];

export function matchPlatformFromUrl(url: string): { platformId: string; handle: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  for (const { platformId, regex, extractGroup } of PLATFORM_URL_PATTERNS) {
    const match = trimmed.match(regex);
    if (match) {
      const extractedHandle =
        match[extractGroup] ?? match.find((group, index) => index > 0 && Boolean(group)) ?? '';
      const handle = safelyDecodeURIComponent(extractedHandle).trim();
      if (handle) return { platformId, handle };
    }
  }
  return null;
}

export function createEmptySocialLink(): EditableSocialLink {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    platformId: '',
    handle: '',
    label: '',
    url: '',
  };
}

export function createInitialSocialLinks(): EditableSocialLink[] {
  return [createEmptySocialLink()];
}

export function mapEditableSocialLinks(
  links: { label: string; url: string }[],
): EditableSocialLink[] {
  const result: EditableSocialLink[] = [];

  for (const link of links) {
    const trimmedLabel = link.label?.trim() ?? '';
    const trimmedUrl = link.url?.trim() ?? '';
    if (!trimmedLabel || !trimmedUrl) continue;

    const matched = matchPlatformFromUrl(trimmedUrl);
    if (matched) {
      result.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        platformId: matched.platformId,
        handle: matched.handle,
      });
    } else {
      result.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        platformId: CUSTOM_PLATFORM_ID,
        handle: '',
        label: trimmedLabel,
        url: trimmedUrl,
      });
    }
  }

  if (result.length === 0) {
    return [createEmptySocialLink()];
  }

  return result;
}

export function socialLinksToSave(
  entries: EditableSocialLink[],
  otherLinks: { label: string; url: string }[] = [],
): { label: string; url: string }[] {
  const result: { label: string; url: string }[] = [];
  for (const entry of entries) {
    if (entry.platformId === CUSTOM_PLATFORM_ID) {
      const label = (entry.label ?? '').trim();
      const url = normalizeSocialUrlForOpening(entry.url ?? '');
      if (label && url) result.push({ label, url });
    } else {
      const built = buildSocialUrl(entry.platformId, entry.handle);
      if (built) result.push(built);
    }
  }
  return [...result, ...otherLinks];
}
