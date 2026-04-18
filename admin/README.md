# TailTag Admin Dashboard

Next.js app for TailTag operations (player management, events, tags, moderation, analytics, achievements, pre-event checklist). Uses Supabase for data/auth.

## Prerequisites

- Node.js 18+ and npm
- Supabase project with the existing TailTag schema
- Environment variables set (see `.env.example`)

## Setup

1. Install dependencies:

```bash
cd admin
npm install
```

2. Configure env:

- Copy `.env.example` to `.env.local`
- Set:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (server actions; never expose client-side)
  - `ADMIN_IS_DEV_PROJECT=true` only for the dev Supabase project when enabling dev-only destructive cleanup actions

## Running locally

```bash
npm run dev
```

App runs on http://localhost:3000. Login with a Supabase Auth user whose `profiles.role` is one of: `owner`, `organizer`, `staff`, `moderator`.

## Available pages (high level)

- Dashboard, Players, Conventions (config/staff), Tags, Staff assignments
- Reports queue, Fursuit moderation queue
- Analytics (metrics, CSV export, simulate catch), Achievements (grant/revoke), Errors (admin_error_log)
- Pre-event checklist (local storage)
- Audit log

## Notes

- Server actions use the service role; ensure env var is present before running.
- CSV export currently limits to 2000 rows per request.
- Mobile Staff Mode in the main app is gated by `EXPO_PUBLIC_STAFF_MODE_ENABLED` and roles.
- Database types (`types/database.ts`) are copied from the main app. If schema changes, re-copy from `../src/types/database.ts`.
