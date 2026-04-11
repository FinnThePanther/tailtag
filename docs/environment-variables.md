# Environment Variables

This document lists the environment variables used by TailTag surfaces. Do not commit secret values.

## Mobile app

The mobile app reads public runtime values from Expo config. `app.config.ts` selects values based on `APP_ENV`, and `src/lib/runtimeConfig.ts` exposes them to app code.

| Variable | Required locally | Secret | Used by | Notes |
| --- | --- | --- | --- | --- |
| `APP_ENV` | No | No | Expo config, native env sync | Defaults to `development`. Supported values are `development`, `staging`, and `production`. |
| `EXPO_PUBLIC_APP_ENV` | No | No | EAS build env | Mirrors the selected app environment in EAS build profiles. |
| `EXPO_PUBLIC_SUPABASE_URL` | No for normal local dev | No | EAS build env | Public Supabase project URL. Local mobile config is currently resolved through `app.config.ts`. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | No for normal local dev | No | EAS build env | Public anon key. It is safe for clients, but should still be kept consistent by environment. |
| `EXPO_PUBLIC_STAFF_MODE_ENABLED` | No | No | Mobile feature flag | Enables staff mode UI when set to `true`; role checks still apply. |
| `EXPO_PUBLIC_SENTRY_DSN` | No | No | Mobile Sentry setup | Optional DSN for mobile error reporting. |

## Admin dashboard

Create `admin/.env.local` from `admin/.env.example` for local admin development.

| Variable | Required locally | Secret | Used by | Notes |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | No | Admin client and server code | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | No | Admin client and server code | Public anon key for browser-safe Supabase access. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for server actions | Yes | Admin server actions | Required for privileged operational workflows. Never expose client-side. |
| `MAPBOX_ACCESS_TOKEN` | Required for geocoding features | Yes | Admin geocoding API route | Used by convention geofence workflows. |

## Supabase Edge Functions

Set Edge Function secrets through Supabase, not in committed files.

| Variable | Required | Secret | Used by | Notes |
| --- | --- | --- | --- | --- |
| `SUPABASE_URL` | Yes | No | Edge Functions | Project URL for internal Supabase calls. |
| `SERVICE_ROLE_KEY` | Yes | Yes | Edge Functions | Preferred service-role secret name for privileged calls. |
| `SUPABASE_SERVICE_ROLE_KEY` | Fallback | Yes | Edge Functions | Some functions accept this as a fallback service-role name. |
| `SUPABASE_ANON_KEY` | Function-specific | No | Public-authenticated Edge Function flows | Used by functions that need anon-key request handling. |
| `ANON_KEY` | Fallback | No | Public-authenticated Edge Function flows | Fallback name for anon key in some functions. |
| `SUPABASE_JWT_SECRET` | Function-specific | Yes | Push notification authorization | Used by `send-push` when verifying JWT-based requests. |
| `JWT_SECRET` | Fallback | Yes | Push notification authorization | Fallback name for JWT secret. |

`docs/environment-setup.md` has the fuller per-environment Supabase secret and Vault setup checklist.

## Scripts and CI

| Variable | Required | Secret | Used by | Notes |
| --- | --- | --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Backend CI and scripts | Yes | Supabase CLI | Used to link projects, deploy functions, generate types, and verify environments. |
| `SUPABASE_DB_PASSWORD` | Backend CI and scripts | Yes | Supabase CLI | Required for linked database operations. |
| `PROJECT_REF` | Backend CI | No | Supabase CLI | Selects target Supabase project. |
| `EXPO_TOKEN` | EAS CI builds | Yes | EAS build workflow | Used by GitHub Actions to submit EAS builds. |
| `OPENAI_API_KEY` | Optional local Supabase Studio feature | Yes | Supabase local Studio | Referenced by `supabase/config.toml`; not required for app development. |

## Public vs secret values

Public URL and anon-key values are designed for client use. Service-role keys, database passwords, access tokens, JWT secrets, Mapbox tokens, provider secrets, Firebase service accounts, and native signing files are secrets and must not be committed.
