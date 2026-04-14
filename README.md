# TailTag

TailTag is a real-world convention game where players register fursuits, catch other fursuiters at events, and track catches, achievements, stats, and leaderboards.

## What's in this repo

- `app/` and `src/` contain the Expo React Native mobile app.
- `admin/` contains the Next.js admin dashboard for operations, moderation, analytics, and event management.
- `web/` contains the Astro landing site.
- `packages/achievement-rules/` contains shared achievement and daily task rule definitions.
- `supabase/` contains database migrations, seed data, local Supabase config, and Edge Functions.
- `docs/` contains architecture notes, local development guidance, environment setup notes, release readiness notes, and backend runbooks.

## Prerequisites

- Node.js 20 is recommended because CI uses Node 20.
- npm is used for dependency installation in each app/package.
- Expo and EAS tooling are only required when building or submitting native mobile builds.
- Supabase CLI is only required for backend work.
- Native platform tooling is required for `npm run ios` and `npm run android`:
  - Xcode for iOS builds.
  - Android Studio and an Android SDK/device or emulator for Android builds.

## Setup

Install the root mobile app dependencies first:

```bash
npm install
```

The admin dashboard and landing site have their own lockfiles and dependencies:

```bash
cd admin
npm install
```

```bash
cd web
npm install
```

## Running the mobile app

From the repository root:

```bash
npm run start
```

Useful mobile commands:

```bash
npm run ios
npm run android
npm run web
```

The default app environment is `development`. Native runs sync environment-specific config before launching.

## Running the admin dashboard

The admin dashboard requires local environment variables. Copy `admin/.env.example` to `admin/.env.local` and fill in the Supabase values for the environment you want to use.

```bash
cd admin
npm run dev
```

The app runs at http://localhost:3000 by default.

## Running the landing site

```bash
cd web
npm run dev
```

Use `npm run build` in `web/` to build the static site.

## Backend and environments

Mobile public Supabase config is resolved in `app.config.ts` for `development`, `staging`, and `production`.

Backend work lives under `supabase/`. The repo includes migrations, reference seed data, local Supabase configuration, and Edge Functions. For provisioning storage buckets, realtime publications, cron jobs, Edge Function secrets, auth providers, and environment-specific setup, see `docs/environment-setup.md`.

## Validation

Run the root validation command for mobile changes:

```bash
npm run ci:validate
```

Validate the admin dashboard:

```bash
cd admin
npm run lint
npm run build
```

Validate the landing site:

```bash
cd web
npm run build
```

Type-check the shared achievement rules package:

```bash
cd packages/achievement-rules
npm run lint
```

## Useful docs

- `docs/architecture.md` explains how the mobile app, admin dashboard, landing site, shared rules, and Supabase backend fit together.
- `docs/local-development.md` has deeper local setup and troubleshooting notes.
- `docs/environment-variables.md` lists the environment variables used by each surface.
- `docs/environment-setup.md` covers backend and Supabase environment setup.
- `docs/backend-overview.md` explains the Supabase backend, Edge Functions, migrations, seeds, cron jobs, and operational scripts.
- `docs/mobile-overview.md` explains the Expo app structure, routing, state/data patterns, and native capabilities.
- `docs/RELEASE_READINESS.md` tracks release readiness work.
- `docs/runbooks/sync-environments.md` covers environment sync operations.
- `docs/runbooks/rollback.md` covers rollback operations.
- `admin/README.md` has more detail about the admin dashboard.

## Contributions

Contribution guidelines will be added later.
