# TailTag Cloudflare Workers

Phase 2 introduces a Cloudflare-based orchestration layer for gameplay events.
This package contains three Workers plus shared tooling for local development.

## Workers

- **event-ingress** — authenticated HTTP entry point that verifies HMAC-signed
  events from Supabase and enqueues them on `tailtag-events`.
- **orchestrator** — queue consumer that evaluates achievement and
  daily task rules using Supabase as the source of truth.
- **daily-rotation** — cron-triggered worker that delegates daily task rotation
  to the existing Supabase `rotate-dailys` function.
- **dlq-inspector** — optional DLQ consumer for inspecting failed events.

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

## Dead Letter Queue (DLQ)

Failed events are automatically sent to the DLQ after:
- **3 retry attempts** (configured via `max_retries`)
- **Exponential backoff**: 5s → 10s → 20s delays (up to 5 min max)
- **Total retry window**: ~35 seconds before DLQ

### Inspecting Failed Events

Deploy the DLQ inspector to monitor failed events:

```bash
npm run deploy:dlq-inspector
```

Failed events will be logged to the Cloudflare dashboard under the `dlq-inspector` worker.
You can view logs via:

```bash
wrangler tail dlq-inspector
```

Or in the Cloudflare dashboard: Workers & Pages → dlq-inspector → Logs

### DLQ Best Practices

- **Monitor regularly**: Check for patterns in failed events
- **Investigate root causes**: Failed events often indicate data issues or bugs
- **Manual retry**: After fixing issues, events can be manually replayed via the orchestrator
- **Keep inspector deployed**: Only deploy when actively investigating failures to avoid unnecessary processing
