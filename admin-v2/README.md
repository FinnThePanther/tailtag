# TailTag Admin v2

SvelteKit rewrite of the existing TailTag admin dashboard. This app is intended to run as a
separate Vercel project named `admin-v2` while the current `admin/` Next.js dashboard remains live.

## Setup

```bash
cd admin-v2
npm install
cp .env.example .env
npm run dev
```

Start with the dev Supabase project:

- `NEXT_PUBLIC_SUPABASE_URL=https://rtxbvjicfxgcouufumce.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<dev anon key>`
- `SUPABASE_SERVICE_ROLE_KEY=<dev service role key>`
- `MAPBOX_ACCESS_TOKEN=<mapbox token>`
- `ADMIN_REPAIR_SUPABASE_PROJECT_REFS=rtxbvjicfxgcouufumce` for dev silent repair, or add staging `yjsadmswobafychfpoxe` only where historical repair is approved

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

Convention closeout lifecycle validation uses
[`../docs/runbooks/convention-closeout-lifecycle.md`](../docs/runbooks/convention-closeout-lifecycle.md).

The old `admin/` app should remain deployed until this app passes workflow and visual parity checks.
