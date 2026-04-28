import type { ConfigContext, ExpoConfig } from 'expo/config';
import fs from 'fs';
import path from 'path';

const { envConfigs, resolveAppEnv } = require('./scripts/native-env.config.cjs') as {
  envConfigs: Record<
    'development' | 'staging' | 'production',
    {
      appDisplayName: string;
      iosBundleId: string;
      androidApplicationId: string;
      googleServicesFile: string;
      iosGoogleServicesFile: string;
    }
  >;
  resolveAppEnv: (input?: string) => 'development' | 'staging' | 'production';
};
const rootPackage = require('./package.json') as { version: string };

const APP_ENV = resolveAppEnv(process.env.APP_ENV);
const env = envConfigs[APP_ENV];
const publicEnvConfig = {
  development: {
    supabaseUrl: 'https://rtxbvjicfxgcouufumce.supabase.co',
    supabaseAnonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0eGJ2amljZnhnY291dWZ1bWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTA1MDgsImV4cCI6MjA3NDc2NjUwOH0.5YA3PLhJqbek_Z8cf8CaRXJNZjl2ZvCSnkVpNrtLGww',
  },
  staging: {
    supabaseUrl: 'https://yjsadmswobafychfpoxe.supabase.co',
    supabaseAnonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlqc2FkbXN3b2JhZnljaGZwb3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzczMjMsImV4cCI6MjA5MDgxMzMyM30.MDrOcAvO3fg1AOVZym-xXl3txtlkDnm4O8YNjTZihuI',
  },
  production: {
    supabaseUrl: 'https://dowtlhkzbxxmiflpswvd.supabase.co',
    supabaseAnonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvd3RsaGt6Ynh4bWlmbHBzd3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzc2MjIsImV4cCI6MjA5MDgxMzYyMn0.KIw5TF-tBq3NIKjpzkNGagLR0jwiYKP_s7RqchEhXHo',
  },
} as const;
const publicEnv = publicEnvConfig[APP_ENV];
const CAMERA_PERMISSION =
  'TailTag needs camera access so you can take fursuit, profile, and catch photos.';
const PHOTO_LIBRARY_PERMISSION =
  'TailTag needs photo library access so you can add profile, fursuit, and catch photos.';
const LOCATION_WHEN_IN_USE_PERMISSION =
  'TailTag uses your location only when you choose to verify that you are at a convention. TailTag does not continuously track your location.';
const NFC_PERMISSION = 'TailTag needs NFC access to scan fursuit tags.';
const maybeResolveExistingFile = (relativePath: string) => {
  const absolutePath = path.resolve(__dirname, relativePath);
  return fs.existsSync(absolutePath) ? relativePath : undefined;
};
const resolveRequiredExistingFile = (relativePath: string, label: string) => {
  const absolutePath = path.resolve(__dirname, relativePath);
  if (fs.existsSync(absolutePath)) {
    return relativePath;
  }

  throw new Error(`Missing ${label} for APP_ENV=${APP_ENV}. Expected file at ${relativePath}.`);
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: env.appDisplayName,
  slug: 'tailtag',
  version: rootPackage.version,
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: 'https://u.expo.dev/3ae47a1a-6584-423d-b52d-90b5acd11048',
    enabled: true,
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
    requestHeaders: {
      'expo-channel-name': APP_ENV === 'production' ? 'production' : 'staging',
    },
  },
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    googleServicesFile: maybeResolveExistingFile(env.iosGoogleServicesFile),
    usesAppleSignIn: true,
    infoPlist: {
      NSPhotoLibraryUsageDescription: PHOTO_LIBRARY_PERMISSION,
      NSCameraUsageDescription: CAMERA_PERMISSION,
      NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE_PERMISSION,
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['remote-notification'],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidApplicationId,
    googleServicesFile: resolveRequiredExistingFile(
      env.googleServicesFile,
      'Android Firebase config',
    ),
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_SETTINGS',
      'android.permission.VIBRATE',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        project: 'tailtag',
        organization: 'finnapps',
      },
    ],
    'expo-font',
    [
      'react-native-nfc-manager',
      {
        includeNdefEntitlement: false,
        nfcPermission: NFC_PERMISSION,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: CAMERA_PERMISSION,
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: PHOTO_LIBRARY_PERMISSION,
        cameraPermission: CAMERA_PERMISSION,
        microphonePermission: false,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE_PERMISSION,
        locationAlwaysPermission: false,
        locationAlwaysAndWhenInUsePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#7c3aed',
      },
    ],
    'expo-web-browser',
    'expo-apple-authentication',
  ],
  scheme: 'tailtag',
  extra: {
    router: {},
    environment: APP_ENV,
    supabaseUrl: publicEnv.supabaseUrl,
    supabaseAnonKey: publicEnv.supabaseAnonKey,
    supabaseImageTransformsEnabled:
      process.env.EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORMS_ENABLED === 'true',
    staffModeEnabled: process.env.EXPO_PUBLIC_STAFF_MODE_ENABLED === 'true',
    eas: {
      projectId: '3ae47a1a-6584-423d-b52d-90b5acd11048',
    },
  },
  owner: 'finnthepanther',
});
