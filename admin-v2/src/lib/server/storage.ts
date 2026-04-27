const OBJECT_PUBLIC_PATH = '/storage/v1/object/public/';
const OBJECT_AUTHENTICATED_PATH = '/storage/v1/object/authenticated/';
const RENDER_PUBLIC_PATH = '/storage/v1/render/image/public/';
const RENDER_AUTHENTICATED_PATH = '/storage/v1/render/image/authenticated/';

const STORAGE_PREFIXES = [
  OBJECT_PUBLIC_PATH,
  OBJECT_AUTHENTICATED_PATH,
  RENDER_PUBLIC_PATH,
  RENDER_AUTHENTICATED_PATH,
] as const;

export const ALLOWED_MEDIA_BUCKETS = [
  'profile-avatars',
  'fursuit-avatars',
  'catch-photos',
] as const;

export function buildAdminStorageProxyUrl(bucket: string, path: string): string {
  const encodedPath = path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `/api/storage/${encodeURIComponent(bucket)}/${encodedPath}`;
}

export function extractStorageLocation(
  url: string | null | undefined,
): { bucket: string; path: string } | null {
  if (!url) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const pathname = parsed.pathname;

  for (const prefix of STORAGE_PREFIXES) {
    const index = pathname.indexOf(prefix);
    if (index === -1) {
      continue;
    }

    const suffix = pathname.slice(index + prefix.length);
    const [bucket, ...pathParts] = suffix.split('/').filter(Boolean);
    if (!bucket || pathParts.length === 0) {
      continue;
    }

    return {
      bucket,
      path: pathParts.join('/'),
    };
  }

  return null;
}

export function resolveAdminMediaUrl(params: {
  bucket?: string | null;
  path?: string | null;
  legacyUrl?: string | null;
}): string | null {
  const normalizedBucket = params.bucket?.trim() ?? '';
  const normalizedPath = params.path?.trim() ?? '';

  if (normalizedBucket && normalizedPath) {
    return buildAdminStorageProxyUrl(normalizedBucket, normalizedPath);
  }

  const location = extractStorageLocation(params.legacyUrl ?? null);
  if (!location) {
    return params.legacyUrl ?? null;
  }

  return buildAdminStorageProxyUrl(location.bucket, location.path);
}
