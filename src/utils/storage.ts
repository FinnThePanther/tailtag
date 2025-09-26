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
    const bucketIndex = segments.findIndex((segment) => segment === bucketName);

    if (bucketIndex === -1) {
      return null;
    }

    const objectSegments = segments.slice(bucketIndex + 1);
    return objectSegments.join('/');
  } catch (error) {
    console.warn('Failed to parse storage object path', error);
    return null;
  }
};
