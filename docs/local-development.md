# Local Development

This guide expands on the root README with practical local setup notes for each part of TailTag.

## Prerequisites

- Node.js 22.
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

Run the mobile validation command for app-only changes:

```bash
npm run validate:mobile
```

Run the full PR-equivalent repository validation when Docker/Supabase local
development is available:

```bash
npm run validate:repo
```

This runs `validate:types:local`, which starts Supabase locally and resets the
local Supabase database from committed migrations and seeds.

Run admin checks:

```bash
npm run validate:admin
```

Run landing site checks:

```bash
npm run validate:web
```

Run shared rules validation:

```bash
npm run validate:packages
```

## Common issues

- If native app startup fails because Firebase config files are missing, confirm the environment-specific Google service files exist for the selected `APP_ENV`.
- If admin actions fail with a service-role error, confirm `SUPABASE_SERVICE_ROLE_KEY` is set in `admin/.env.local`.
- If generated database types drift, use the root `npm run gen:types` workflow and review the resulting type changes before committing. Use `npm run validate:types:local` for deterministic checks from local migrations and `npm run validate:types:remote:dev` for explicit dev-project drift checks.
- If backend behavior differs by environment, run `scripts/verify-environment.sh` for the target environment and compare against `docs/environment-setup.md`.
