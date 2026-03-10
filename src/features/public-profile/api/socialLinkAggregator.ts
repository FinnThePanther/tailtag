import type { FursuitSocialLink } from '../../../types/database';
import type { FursuitSummary } from '../../suits/types';

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

export function aggregateSocialLinks(
  fursuits: FursuitSummary[],
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

  // Then aggregate from all fursuit bios, deduplicating against profile links
  for (const fursuit of fursuits) {
    if (!fursuit.bio?.socialLinks) continue;
    for (const link of fursuit.bio.socialLinks) {
      addLink(link);
    }
  }

  return result;
}
