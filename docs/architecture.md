# Architecture Overview

TailTag is a TypeScript monorepo with separate surfaces for the mobile game, operations dashboard, public landing site, shared gameplay rules, and Supabase backend.

## System map

```text
Expo mobile app
  -> Supabase Auth
  -> Supabase Postgres, Storage, Realtime
  -> Supabase Edge Functions for privileged gameplay operations

Next.js admin dashboard
  -> Supabase Auth/session helpers
  -> Supabase service-role server actions for operational workflows

Astro landing site
  -> Static pages only

Shared achievement rules package
  -> Imported by clients and backend workers that need consistent rule evaluation

Supabase backend
  -> Migrations, reference seed data, storage, realtime, cron jobs, queues, and Edge Functions
```

## Mobile app

The mobile app is an Expo React Native app. Routes live in `app/` through Expo Router, while shared UI, hooks, feature modules, API helpers, theme tokens, and generated database types live in `src/`.

The app uses Supabase for authentication, database access, storage-backed media, realtime updates, and Edge Function calls. Runtime public configuration is resolved through `app.config.ts` and read in `src/lib/runtimeConfig.ts`.

## Admin dashboard

The admin dashboard is a Next.js app in `admin/`. It provides operational workflows for player management, conventions, moderation, analytics, staff assignments, achievements, and event readiness.

Client-facing Supabase access uses public URL and anon key environment variables. Privileged server actions use `SUPABASE_SERVICE_ROLE_KEY` from server-only environment configuration.

## Landing site

The landing site is an Astro static site in `web/`. It is intentionally separate from the app backend and does not require Supabase to render.

## Shared rules

`packages/achievement-rules/` defines typed achievement and task rule logic that can be reused across app and backend code. Keeping these rules in a shared package reduces drift between client-visible behavior and backend awarding workflows.

## Backend

Supabase owns the app's core backend responsibilities:

- Auth and user sessions.
- Postgres schema, row-level security, views, functions, and queues.
- Storage buckets for profile, fursuit, and catch media.
- Realtime subscriptions for gameplay and notification updates.
- Edge Functions for privileged or server-side workflows.
- Cron jobs for scheduled processing and cleanup.

Database schema changes should be made through migrations under `supabase/migrations/`. Reference seed data lives in `supabase/seeds/reference.sql`.

## Delivery

CI validates the repository with `.github/workflows/ci.yml`. Branch delivery in `.github/workflows/branch-delivery.yml` deploys backend changes to the appropriate Supabase environment and can trigger EAS builds for mobile changes.

Branch protection rules and required CI checks for `dev` and `main` are defined in `docs/ci-cd-policy.md`.
