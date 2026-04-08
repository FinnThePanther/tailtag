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

const APP_ENV = resolveAppEnv(process.env.APP_ENV);
const env = envConfigs[APP_ENV];
const maybeResolveExistingFile = (relativePath: string) => {
  const absolutePath = path.resolve(__dirname, relativePath);
  return fs.existsSync(absolutePath) ? relativePath : undefined;
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: env.appDisplayName,
  slug: 'tailtag',
  version: '0.0.1',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
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
      NSPhotoLibraryUsageDescription:
        'TailTag needs access to your photo library so you can add photos of your fursuits to your profile.',
      NSCameraUsageDescription:
        'TailTag needs access to your camera so you can take photos of your fursuits.',
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
    googleServicesFile:
      maybeResolveExistingFile(env.googleServicesFile) ?? './google-services.json',
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_SETTINGS',
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
        nfcPermission: 'TailTag needs NFC access to scan fursuit tags.',
      },
    ],
    'expo-camera',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#7c3aed',
      },
    ],
    'expo-apple-authentication',
    '@sentry/react-native',
  ],
  scheme: 'tailtag',
  extra: {
    router: {},
    eas: {
      projectId: '3ae47a1a-6584-423d-b52d-90b5acd11048',
    },
  },
  owner: 'finnthepanther',
});
