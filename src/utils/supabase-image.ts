const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

type TransformOptions = {
  width: number;
  height: number;
  resize?: 'cover' | 'contain' | 'fill';
  quality?: number;
};

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
  if (!url) return null;
  if (!SUPABASE_URL || !url.startsWith(SUPABASE_URL)) return url;

  const objectIndex = url.indexOf(OBJECT_PATH);
  if (objectIndex === -1) return url;

  const pathAfterBucket = url.slice(objectIndex + OBJECT_PATH.length);
  const width = Math.min(Math.max(Math.round(options.width), 1), 2500);
  const height = Math.min(Math.max(Math.round(options.height), 1), 2500);
  const resize = options.resize ?? 'cover';
  const quality = options.quality ?? 75;

  return `${SUPABASE_URL}${RENDER_PATH}${pathAfterBucket}?width=${width}&height=${height}&resize=${resize}&quality=${quality}`;
}
