# Local Development

This guide expands on the root README with practical local setup notes for each part of TailTag.

## Prerequisites

- Node.js 20.
- npm.
- Xcode for local iOS native builds.
- Android Studio and Android SDK for local Android native builds.
- Supabase CLI for backend work.
- EAS CLI only when creating cloud native builds.

## Install dependencies

Install dependencies separately for each app that has its own lockfile:

```bash
npm install
```

```bash
cd admin
npm install
```

```bash
cd web
npm install
```

The shared `packages/achievement-rules/` package does not need a separate install for normal root workflows. Run its package-level validation from that directory when changing shared rules.

## Mobile app

Start the Expo dev server from the repo root:

```bash
npm run start
```

Run a native local build:

```bash
npm run ios
npm run android
```

Run the Expo web target:

```bash
npm run web
```

The default app environment is `development`. Environment-specific native config is resolved by `app.config.ts` and synced by `scripts/sync-native-env.cjs` before native runs and prebuilds.

Use explicit environment scripts when you need a non-default environment:

```bash
npm run ios:staging
npm run android:staging
npm run ios:production
npm run android:production
```

## Admin dashboard

Create an admin env file:

```bash
cd admin
cp .env.example .env.local
```

Fill in the required Supabase values, then run:

```bash
npm run dev
```

The dashboard runs at http://localhost:3000 by default. The service-role key is required for server actions and must stay server-only.

## Landing site

```bash
cd web
npm run dev
```

Build the static site:

```bash
npm run build
```

## Backend work

For backend changes, install and authenticate the Supabase CLI, then use the committed assets under `supabase/`.

Common backend files:

- `supabase/config.toml` for local Supabase settings.
- `supabase/migrations/` for schema changes.
- `supabase/seeds/reference.sql` for reference data.
- `supabase/functions/` for Edge Functions.
- `scripts/setup-environment.sh` and `scripts/verify-environment.sh` for remote environment operations.

Use `docs/environment-setup.md` for environment provisioning details before touching shared staging or production resources.

## Validation

Run the root validation command for mobile changes:

```bash
npm run ci:validate
```

Run admin checks:

```bash
cd admin
npm run lint
npm run build
```

Run landing site checks:

```bash
cd web
npm run build
```

Run shared rules validation:

```bash
cd packages/achievement-rules
npm run lint
```

## Common issues

- If native app startup fails because Firebase config files are missing, confirm the environment-specific Google service files exist for the selected `APP_ENV`.
- If admin actions fail with a service-role error, confirm `SUPABASE_SERVICE_ROLE_KEY` is set in `admin/.env.local`.
- If generated database types drift, use the root `npm run gen:types` workflow and review the resulting type changes before committing.
- If backend behavior differs by environment, run `scripts/verify-environment.sh` for the target environment and compare against `docs/environment-setup.md`.
