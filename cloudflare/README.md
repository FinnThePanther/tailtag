# TailTag Cloudflare Workers

Phase 2 introduces a Cloudflare-based orchestration layer for gameplay events.
This package contains three Workers plus shared tooling for local development.

## Workers

- **event-ingress** — authenticated HTTP entry point that verifies HMAC-signed
  events from Supabase and enqueues them on `tailtag-events`.
- **orchestrator** — queue consumer scaffold that will evaluate achievement and
  daily task rules using Supabase as the source of truth.
- **daily-rotation** — cron-triggered worker that delegates daily task rotation
  to the existing Supabase `rotate-dailys` function.

## Setup

```bash
cd cloudflare
npm install
```

Set the required secrets for each worker (replace placeholder values):

```bash
# event-ingress
wrangler secret put EVENT_SHARED_SECRET --config ./event-ingress/wrangler.toml
wrangler secret put ALLOWED_SOURCE --config ./event-ingress/wrangler.toml <<< "supabase-edge"

# orchestrator + daily-rotation
wrangler secret put SUPABASE_URL --config ./orchestrator/wrangler.toml
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config ./orchestrator/wrangler.toml
wrangler secret put SUPABASE_URL --config ./daily-rotation/wrangler.toml
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config ./daily-rotation/wrangler.toml
wrangler secret put DAILY_ROTATION_FUNCTION --config ./daily-rotation/wrangler.toml <<< "rotate-dailys"
```

Optionally share the same secrets across workers using Wrangler environments:

```bash
wrangler secret put SUPABASE_URL --config ./orchestrator/wrangler.toml --env production
```

## Local Development

```bash
npm run dev:event-ingress
npm run dev:orchestrator
npm run dev:daily-rotation
```

## Deployment

```bash
wrangler deploy --config ./event-ingress/wrangler.toml
wrangler deploy --config ./orchestrator/wrangler.toml
wrangler deploy --config ./daily-rotation/wrangler.toml
```

Queues were created with:

```bash
wrangler queues create tailtag-events
wrangler queues create tailtag-events-dlq
```

The orchestrator consumer is configured with an exponential back-off and will
forward exhausted messages to the `tailtag-events-dlq` dead-letter queue.
