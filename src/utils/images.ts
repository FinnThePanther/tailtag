import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { extractStoragePathFromUrl } from './supabase-image';

export type ImageAssetMetadata = {
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  uri: string;
};

const EXTENSION_MIME_TYPES: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const normalizeExtension = (value: string | null | undefined): string | null => {
  if (!value) return null;

  const normalized = value.trim().toLowerCase().replace(/^\./, '');

  if (!normalized) return null;
  if (normalized === 'jpeg') return 'jpg';

  return normalized;
};

export const extensionFromPath = (value: string | null | undefined): string | null => {
  if (!value) return null;

  const cleanValue = value.split('?')[0]?.split('#')[0] ?? value;
  const match = cleanValue.match(/\.([a-z0-9]+)$/i);

  return normalizeExtension(match?.[1]);
};

export const extensionFromMimeType = (mimeType: string | null | undefined): string | null => {
  if (!mimeType) return null;

  const subtype = mimeType.split('/')[1]?.toLowerCase();
  if (!subtype) return null;

  if (subtype === 'jpeg') return 'jpg';
  if (subtype.includes('heic')) return 'heic';
  if (subtype.includes('heif')) return 'heif';

  return normalizeExtension(subtype);
};

export const inferImageExtension = (
  metadata: Pick<ImageAssetMetadata, 'fileName' | 'mimeType' | 'uri'>,
): string => {
  return (
    extensionFromPath(metadata.fileName) ??
    extensionFromMimeType(metadata.mimeType) ??
    extensionFromPath(metadata.uri) ??
    'jpg'
  );
};

export const inferImageMimeType = (
  metadata: Pick<ImageAssetMetadata, 'fileName' | 'mimeType' | 'uri'>,
): string => {
  const explicitMimeType = metadata.mimeType?.trim().toLowerCase();

  if (explicitMimeType === 'image/jpg') {
    return 'image/jpeg';
  }

  if (explicitMimeType) {
    return explicitMimeType;
  }

  const extension = inferImageExtension(metadata);

  return EXTENSION_MIME_TYPES[extension] ?? 'image/jpeg';
};

type ProcessImageOptions = {
  maxDimension: number;
  quality?: number;
  format?: 'jpeg' | 'png';
};

type ProcessedImage = {
  uri: string;
  width: number;
  height: number;
  mimeType: string;
};

export async function processImageForUpload(
  sourceUri: string,
  options: ProcessImageOptions,
): Promise<ProcessedImage> {
  const { maxDimension, quality = 0.85, format = 'jpeg' } = options;
  const saveFormat = format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG;

  // Render without transformation to read dimensions
  const probe = await ImageManipulator.manipulate(sourceUri).renderAsync();
  const { width, height } = probe;

  const scale = Math.min(maxDimension / width, maxDimension / height, 1);
  const imageRef =
    scale < 1
      ? await ImageManipulator.manipulate(sourceUri)
          .resize({ width: Math.round(width * scale), height: Math.round(height * scale) })
          .renderAsync()
      : probe;

  const saved = await imageRef.saveAsync({ format: saveFormat, compress: quality });

  return {
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
  };
}

export const IMAGE_UPLOAD_PRESETS = {
  profileAvatar: { maxDimension: 512, quality: 0.85, format: 'jpeg' as const },
  fursuitAvatar: { maxDimension: 1024, quality: 0.85, format: 'jpeg' as const },
  catchPhoto: { maxDimension: 1500, quality: 0.85, format: 'jpeg' as const },
};

export function extractStoragePath(
  fileUrl: string | null | undefined,
  bucket: string,
): string | null {
  return extractStoragePathFromUrl(fileUrl, bucket);
}

export const buildImageUploadCandidate = <T extends ImageAssetMetadata>(
  asset: T,
  fallbackBasename: string,
): {
  fileName: string;
  fileSize: number;
  mimeType: string;
  uri: string;
} => {
  const mimeType = inferImageMimeType(asset);
  const extension = inferImageExtension({
    fileName: asset.fileName,
    mimeType,
    uri: asset.uri,
  });

  return {
    uri: asset.uri,
    mimeType,
    fileName: asset.fileName ?? `${fallbackBasename}.${extension}`,
    fileSize: asset.fileSize ?? 0,
  };
};
