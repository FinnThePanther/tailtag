# Mobile Overview

The TailTag mobile app is an Expo React Native app using Expo Router, Supabase, React Query, and native capabilities for camera, NFC, notifications, and media handling.

## App structure

- `app/` contains Expo Router routes and route layouts.
- `src/features/` contains feature-specific API helpers, hooks, components, and types.
- `src/components/` contains shared UI components.
- `src/theme/` contains design tokens and reusable style primitives.
- `src/app-styles/` mirrors route-level styles for files under `app/`.
- `src/lib/` contains shared infrastructure such as Supabase, runtime config, and Sentry setup.
- `src/types/database.ts` contains generated Supabase database types.

## Routing

Expo Router maps files in `app/` to screens. Major route groups include:

- `(auth)` for sign-in and password flows.
- `(tabs)` for the main tabbed app experience.
- `onboarding` for first-run setup.
- `fursuits`, `catches`, `profile`, `leaderboard`, `achievements`, and `daily-tasks` for game features.
- `staff-mode` for role-gated staff workflows.

Keep non-route implementation details outside `app/`. Route-level styles should live in the mirrored `src/app-styles/` tree.

## Data access

`src/lib/supabase.ts` creates the typed Supabase client using runtime values from `src/lib/runtimeConfig.ts`. The app persists auth sessions with AsyncStorage.

Feature modules under `src/features/` own most app-facing API calls and hooks. React Query is used for client cache and async state patterns.

## Runtime environments

`APP_ENV` selects one of the known app environments: `development`, `staging`, or `production`. The default is `development`.

`app.config.ts` resolves environment-specific app display names, bundle IDs, package IDs, Firebase config file names, Supabase public config, and feature flags. Native run and prebuild scripts call `scripts/sync-native-env.cjs` to keep native environment config aligned.

## Native capabilities

The app uses Expo and React Native libraries for:

- Camera and image picker flows.
- Media upload and image manipulation.
- NFC tag scanning.
- QR code rendering and scanning-related catch flows.
- Push notifications.
- Apple authentication and OAuth flows.
- Location permission and geo-verification workflows.
- Sentry error reporting.

When adding native capabilities, update Expo config, platform permissions, and validation notes together.

## Styling conventions

Keep React Native styles out of mobile `*.tsx` files when practical. Prefer sibling `*.styles.ts` files for components in `src/`.

Do not place style-only files under `app/`; Expo Router treats files in `app/` as routes. For route screens, mirror `app/` paths inside `src/app-styles/`.

Small dynamic style merges can stay inline when extracting them would make the code harder to follow.

## Validation

Run the root validation command for mobile changes:

```bash
npm run ci:validate
```

This runs Expo doctor, format check, ESLint, and TypeScript checking.

For native changes, also run the affected platform locally when possible:

```bash
npm run ios
npm run android
```

Use EAS build scripts for cloud builds:

```bash
npm run build:dev:all
npm run build:staging:all
npm run build:prod:all
```
