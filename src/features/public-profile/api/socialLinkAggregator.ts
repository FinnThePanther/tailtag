import type { FursuitSocialLink } from '../../../types/database';

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

export function aggregateSocialLinks(
  _fursuits: unknown[],
  profileLinks: FursuitSocialLink[] = [],
): FursuitSocialLink[] {
  const seen = new Set<string>();
  const result: FursuitSocialLink[] = [];

  const addLink = (link: FursuitSocialLink) => {
    if (!link.url) return;
    const key = normalizeUrl(link.url);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(link);
    }
  };

  // User-level links take priority — add them first
  for (const link of profileLinks) {
    addLink(link);
  }

  return result;
}
