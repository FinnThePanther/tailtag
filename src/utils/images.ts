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

export const extensionFromMimeType = (
  mimeType: string | null | undefined,
): string | null => {
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

export const buildImageUploadCandidate = <
  T extends ImageAssetMetadata,
>(
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
