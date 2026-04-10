import type { ImageSource } from 'expo-image';

import { SUPABASE_URL } from '../lib/runtimeConfig';

const OBJECT_PUBLIC_PATH = '/storage/v1/object/public/';
const OBJECT_AUTHENTICATED_PATH = '/storage/v1/object/authenticated/';
const RENDER_PUBLIC_PATH = '/storage/v1/render/image/public/';
const RENDER_AUTHENTICATED_PATH = '/storage/v1/render/image/authenticated/';

type TransformOptions = {
  width: number;
  height: number;
  resize?: 'cover' | 'contain' | 'fill';
  quality?: number;
};

type StorageMediaParams = {
  bucket: string;
  path: string | null | undefined;
  legacyUrl?: string | null | undefined;
};

type StorageLocation = {
  bucket: string;
  path: string;
  authenticated: boolean;
  render: boolean;
};

function trimPath(path: string): string {
  return path.replace(/^\/+/, '');
}

export function buildAuthenticatedStorageObjectUrl(
  bucket: string,
  path: string,
): string {
  const normalizedBucket = bucket.trim();
  const normalizedPath = trimPath(path.trim());
  return `${SUPABASE_URL}${OBJECT_AUTHENTICATED_PATH}${normalizedBucket}/${normalizedPath}`;
}

export function resolveStorageLocationFromUrl(
  url: string | null | undefined,
): StorageLocation | null {
  if (!url || !SUPABASE_URL || !url.startsWith(SUPABASE_URL)) {
    return null;
  }

  const parseFromPrefix = (
    prefix: string,
    options: { authenticated: boolean; render: boolean },
  ): StorageLocation | null => {
    const index = url.indexOf(prefix);
    if (index === -1) {
      return null;
    }

    const afterPrefix = url.slice(index + prefix.length);
    const withoutQuery = afterPrefix.split('?')[0]?.split('#')[0] ?? '';
    if (!withoutQuery) {
      return null;
    }

    const parts = withoutQuery.split('/');
    const [bucket, ...rest] = parts;
    if (!bucket || rest.length === 0) {
      return null;
    }

    const path = rest.join('/');
    if (!path) {
      return null;
    }

    return {
      bucket,
      path,
      authenticated: options.authenticated,
      render: options.render,
    };
  };

  return (
    parseFromPrefix(RENDER_AUTHENTICATED_PATH, { authenticated: true, render: true }) ??
    parseFromPrefix(RENDER_PUBLIC_PATH, { authenticated: false, render: true }) ??
    parseFromPrefix(OBJECT_AUTHENTICATED_PATH, { authenticated: true, render: false }) ??
    parseFromPrefix(OBJECT_PUBLIC_PATH, { authenticated: false, render: false })
  );
}

export function extractStoragePathFromUrl(
  url: string | null | undefined,
  bucketName?: string | null,
): string | null {
  const location = resolveStorageLocationFromUrl(url);
  if (!location) {
    return null;
  }

  if (bucketName && location.bucket !== bucketName) {
    return null;
  }

  return location.path;
}

export function toAuthenticatedStorageUrl(
  url: string | null | undefined,
): string | null {
  if (!url) {
    return null;
  }

  const location = resolveStorageLocationFromUrl(url);
  if (!location) {
    return url;
  }

  const basePath = location.render
    ? RENDER_AUTHENTICATED_PATH
    : OBJECT_AUTHENTICATED_PATH;
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const queryStart =
    queryIndex === -1
      ? hashIndex
      : hashIndex === -1
      ? queryIndex
      : Math.min(queryIndex, hashIndex);
  const suffix = queryStart === -1 ? '' : url.slice(queryStart);

  return `${SUPABASE_URL}${basePath}${location.bucket}/${location.path}${suffix}`;
}

export function resolveStorageMediaUrl({
  bucket,
  path,
  legacyUrl,
}: StorageMediaParams): string | null {
  if (typeof path === 'string' && path.trim().length > 0) {
    return buildAuthenticatedStorageObjectUrl(bucket, path);
  }

  return toAuthenticatedStorageUrl(legacyUrl);
}

export function getStorageAuthHeaders(
  url: string | null | undefined,
  accessToken: string | null | undefined,
): Record<string, string> | undefined {
  if (!url || !accessToken) {
    return undefined;
  }

  const location = resolveStorageLocationFromUrl(url);
  if (!location || !location.authenticated) {
    return undefined;
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function toExpoImageSource(
  url: string,
  accessToken: string | null | undefined,
): string | ImageSource;
export function toExpoImageSource(
  url: null | undefined,
  accessToken: string | null | undefined,
): null;
export function toExpoImageSource(
  url: string | null | undefined,
  accessToken: string | null | undefined,
): string | ImageSource | null;
export function toExpoImageSource(
  url: string | null | undefined,
  accessToken: string | null | undefined,
): string | ImageSource | null {
  if (!url) {
    return null;
  }

  const headers = getStorageAuthHeaders(url, accessToken);
  if (!headers) {
    return url;
  }

  return {
    uri: url,
    headers,
  };
}

/**
 * Rewrites a Supabase Storage public URL to the Image Transformation endpoint,
 * which serves correctly-sized variants via Supabase's CDN.
 *
 * Returns null for null/undefined/empty input.
 * Returns the URL unchanged for non-Supabase URLs (e.g. local file:// URIs).
 */
export function getTransformedImageUrl(
  url: string | null | undefined,
  options: TransformOptions,
): string | null {
  const authenticatedUrl = toAuthenticatedStorageUrl(url);
  if (!authenticatedUrl) return null;
  if (!SUPABASE_URL || !authenticatedUrl.startsWith(SUPABASE_URL)) return authenticatedUrl;

  const location = resolveStorageLocationFromUrl(authenticatedUrl);
  if (!location) {
    return authenticatedUrl;
  }

  const renderPath = location.authenticated ? RENDER_AUTHENTICATED_PATH : RENDER_PUBLIC_PATH;
  const width = Math.min(Math.max(Math.round(options.width), 1), 2500);
  const height = Math.min(Math.max(Math.round(options.height), 1), 2500);
  const resize = options.resize ?? 'cover';
  const quality = options.quality ?? 75;

  return `${SUPABASE_URL}${renderPath}${location.bucket}/${location.path}?width=${width}&height=${height}&resize=${resize}&quality=${quality}`;
}
