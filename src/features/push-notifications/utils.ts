import Constants from 'expo-constants';

export const getExpoProjectId = (): string | null => {
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.expoConfig?.extra?.projectId ??
    null;

  if (typeof projectId === 'string' && projectId.trim().length > 0) {
    return projectId;
  }

  return null;
};
