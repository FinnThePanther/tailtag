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

The `dev` command watches `src/index.ts` and reloads on changes. The worker runs a catch-up sweep via the shared achievements processor, subscribes to realtime inserts on `achievement_events`, and writes newly granted awards into `public.achievement_notifications` for the clients to poll.

## Production Run

Use the provided `start` script:

```bash
npm run start
```

This executes the listener with [`tsx`](https://github.com/esbuild-kit/tsx), so no pre-compilation step is required. For containerised deployments, ensure signals (`SIGINT`, `SIGTERM`) are forwarded so the listener can unsubscribe cleanly and close the HTTP health server.

### Achievement notifications

- The listener inserts a row into `public.achievement_notifications` every time a new award is granted (also covered by the cron edge function).
- Clients can poll `achievement_notifications` for `acknowledged_at is null` rows, display them, then mark them acknowledged with a `PATCH`/`UPDATE`.
- Optional environment variable `REALTIME_SUBSCRIBE_TIMEOUT_MS` controls how long the worker waits for the realtime channel to join before giving up (defaults to 15 000 ms).
