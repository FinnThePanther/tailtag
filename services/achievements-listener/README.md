# Achievements Realtime Listener

A lightweight worker that listens to Supabase realtime events for the `achievement_events` table and processes them immediately using the shared achievements engine. This service complements the scheduled edge function sweep to provide near real-time achievement awarding.

## Prerequisites

- Node.js 20+
- Access to the Tailtag Supabase project with the service role key

## Environment Variables

| Name | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (e.g. `https://xyz.supabase.co`) |
| `SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Service role key used for admin access |
| `INITIAL_SWEEP_LIMIT` (optional) | Number of events to claim per batch during startup backfill (default `50`) |
| `INITIAL_SWEEP_MAX_BATCHES` (optional) | Maximum batches during startup backfill (default `10`) |

Create a `.env` file based on `.env.example` for local development.

## Local Development

```bash
cd services/achievements-listener
npm install
npm run dev
```

The `dev` command watches `src/index.ts` and reloads on changes. The first thing the worker does is run a catch-up sweep via the shared achievements processor, then it subscribes to realtime inserts on `achievement_events`.

## Production Run

Use the provided `start` script:

```bash
npm run start
```

This executes the listener with [`tsx`](https://github.com/esbuild-kit/tsx), so no pre-compilation step is required. For containerised deployments, ensure signals (`SIGINT`, `SIGTERM`) are forwarded so the listener can unsubscribe cleanly.
