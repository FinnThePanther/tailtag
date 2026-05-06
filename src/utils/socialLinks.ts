const TIKTOK_PROFILE_URL_PREFIX = 'https://www.tiktok.com/@';

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
