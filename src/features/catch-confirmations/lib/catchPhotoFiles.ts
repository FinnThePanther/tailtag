import * as FileSystem from 'expo-file-system/legacy';

import { captureHandledException } from '@/lib/sentry';

const CATCH_PHOTO_DIRECTORY = 'catch-photos';
const CATCH_PHOTO_DIRECTORY_PREFIX = `${CATCH_PHOTO_DIRECTORY}/`;

function userCatchPhotoDirectory(userId: string) {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  return `${FileSystem.documentDirectory}${CATCH_PHOTO_DIRECTORY}/${userId}/`;
}

export async function copyDurableCatchPhoto(params: {
  userId: string;
  batchId: string;
  sourceUri: string;
}): Promise<string> {
  const directory = userCatchPhotoDirectory(params.userId);
  if (!directory) {
    return params.sourceUri;
  }

  const destinationUri = `${directory}${params.batchId}.jpg`;
  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.copyAsync({
      from: params.sourceUri,
      to: destinationUri,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to copy catch photo for retry storage: ${message}`);
  }

  return destinationUri;
}

export async function deleteDurableCatchPhoto(uri: string | null | undefined) {
  if (!uri || !FileSystem.documentDirectory) {
    return;
  }

  const catchPhotoRoot = `${FileSystem.documentDirectory}${CATCH_PHOTO_DIRECTORY_PREFIX}`;
  if (!uri.startsWith(catchPhotoRoot)) {
    return;
  }

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    captureHandledException(error, {
      scope: 'catch-confirmations.deleteDurableCatchPhoto',
    });
  }
}
