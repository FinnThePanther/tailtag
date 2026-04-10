import { captureNonCriticalError } from '../lib/sentry';
import { extractStoragePathFromUrl } from './supabase-image';

export const deriveStoragePathFromPublicUrl = (
  fileUrl: string | null | undefined,
  bucketName: string
) => {
  if (!fileUrl) {
    return null;
  }

  try {
    return extractStoragePathFromUrl(fileUrl, bucketName);
  } catch (error) {
    captureNonCriticalError(error, {
      scope: 'storage.deriveStoragePath',
      bucketName,
      publicUrl: fileUrl,
    });
    return null;
  }
};
