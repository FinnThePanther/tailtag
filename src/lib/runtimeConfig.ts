import Constants from 'expo-constants';

type ExpoExtra = {
  environment?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseImageTransformsEnabled?: boolean | string;
  staffModeEnabled?: boolean | string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }
  }

  return undefined;
};

export const APP_ENV =
  readString(extra.environment) ?? readString(process.env.APP_ENV) ?? 'development';

export const SUPABASE_URL = readString(extra.supabaseUrl) ?? '';

export const SUPABASE_ANON_KEY = readString(extra.supabaseAnonKey) ?? '';

export const SUPABASE_IMAGE_TRANSFORMS_ENABLED =
  readBoolean(extra.supabaseImageTransformsEnabled) ??
  readBoolean(process.env.EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORMS_ENABLED) ??
  false;

export const STAFF_MODE_ENABLED = readBoolean(extra.staffModeEnabled) ?? false;
