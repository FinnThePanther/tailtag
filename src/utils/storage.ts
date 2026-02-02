import { captureNonCriticalError } from '../lib/sentry';

export const deriveStoragePathFromPublicUrl = (
  publicUrl: string | null | undefined,
  bucketName: string
) => {
  if (!publicUrl) {
    return null;
  }

  try {
    const url = new URL(publicUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    const isSupabaseStoragePath =
      segments.length > 4 &&
      segments[0] === 'storage' &&
      segments[1] === 'v1' &&
      segments[2] === 'object' &&
      segments[3] === 'public';

    if (!isSupabaseStoragePath) {
      return null;
    }

    const bucketIndex = segments.findIndex((segment) => segment === bucketName);

    if (bucketIndex === -1) {
      return null;
    }

    const objectSegments = segments.slice(bucketIndex + 1);
    return objectSegments.join('/');
  } catch (error) {
    captureNonCriticalError(error, {
      scope: 'storage.deriveStoragePath',
      bucketName,
      publicUrl,
    });
    return null;
  }
};
