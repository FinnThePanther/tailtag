# Repository Guidelines

## Project Structure & Module Organization
`tailtag` is a TypeScript monorepo. The mobile app lives in `app/` and `src/`. The admin dashboard is in `admin/`, the landing site is in `web/`, shared rule logic is in `packages/achievement-rules/`, and backend work is in `supabase/` with migrations in `supabase/migrations/` and Edge Functions in `supabase/functions/`.

## Product Phase & Decision Bar
TailTag is past MVP. Current work should target the first beta and near-term V1 release quality, not throwaway prototype behavior. Default design and implementation decisions should optimize for beta/V1 readiness:

- Prefer complete, user-facing flows over temporary MVP shortcuts.
- Keep UX polished, clear, and resilient for real staging/beta users.
- Treat onboarding, profile completion, catches, daily tasks, achievements, notifications, and admin moderation as production-facing surfaces.
- Favor maintainable feature foundations that can ship through beta into V1 without immediate rewrites.
- Avoid introducing placeholder copy, incomplete states, hidden debug-only behavior, or brittle local-only assumptions unless explicitly scoped as temporary.
- Preserve release safety: validate changes, keep migrations reversible where practical, and consider OTA/native build implications before changing app/runtime dependencies.

## Backward Compatibility Strategy
TailTag has real users who may not update immediately. Design new features and fixes so older supported app versions keep working unless there is a deliberate, documented reason to require an update.

- Treat feature flags and slow rollouts as rollout controls, not as the whole compatibility strategy. Compatibility should come from additive schemas, tolerant APIs, capability checks, and safe fallbacks.
- Prefer additive backend and database changes: add nullable columns or new tables, preserve old RPC/Edge Function request shapes, keep response fields old clients depend on, and avoid renaming/removing values until the supported-version window has passed.
- When adding a complex feature or a dependency that requires a new native build, gate access by client capability or app/runtime version as well as any user rollout flag. Older builds should keep the old path and never be routed to screens, actions, notifications, or deep links that require unavailable native code.
- New data created by newer clients must remain safe for older clients to read. Provide old-client-safe summaries, hide unsupported sections, map unknown enum values to known fallbacks, or return read-only placeholders instead of letting older clients crash or dead-end.
- Backend code should support both generations during the compatibility window: old clients can keep submitting old payloads, new clients can use new fields, and shared reads normalize data into shapes each client can handle.
- Apply the same thinking to fixes. A client fix may need a server-side guard if older versions can still send bad payloads, receive incompatible data, or exercise a broken path before users update.
- Reserve hard force updates for security issues, data corruption risk, policy/legal requirements, native/runtime incompatibility, or backend contracts that cannot safely support old clients. Prefer soft update prompts and graceful degradation for ordinary feature gaps.
- For core surfaces, including onboarding, profile completion, catches, daily tasks, achievements, notifications, and admin moderation, verify: old clients can still complete the existing flow, old payloads are accepted or safely rejected, old clients can read new data, and rollback/kill-switch behavior is clear.

## Build, Test, and Development Commands
Use `npm install` at the repo root, then run commands from the relevant app directory.

- Codex shell commands in this repository must start with `rtk`, `npm`, or `supabase`. This is enforced by the repo-local Codex `PreToolUse` hook in `.codex/hooks.json`.
- Prefix shell commands with `rtk` to reduce token-heavy output, except for `npm ...` and `supabase ...` commands. Keep `npm` and `supabase` commands unprefixed.
- `npm run start` from the root starts the Expo app.
- `npm run ios` / `npm run android` from the root run native Expo builds locally.
- `npm run lint` and `npm run typecheck` from the root validate the mobile app.
- `npm run validate:mobile` from the root runs Expo doctor, formatting, linting, type checking, and mobile regression tests.
- `npm run validate:repo` from the root runs the full PR-equivalent validation across mobile, admin, web, shared packages, Edge Functions, migrations, and generated database types.
- `npm run gen:types` from the root regenerates Supabase database types in `src/types/database.ts`.
- `npm run validate:types:local` verifies committed database types against a local Supabase schema rebuilt from committed migrations and seeds.
- `npm run validate:types:remote:dev` verifies committed database types match the dev Supabase schema.
- Codex Desktop currently does not inherit the Supabase access token needed for `npm run gen:types`; when working there, ask Nick to run it in his terminal instead of retrying it from Codex.
- `cd admin && npm run dev` starts the admin dashboard.
- `cd admin && npm run build` or `npm run lint` validates the admin app.
- `cd web && npm run dev` or `npm run build` runs the Astro landing site.

## Code Formatting
After making edits to files, **always format them before validating changes**:
```bash
npm run format <file1> <file2> ...
```
For example:
```bash
npm run format src/features/auth/api/auth.ts src/components/Button.tsx
```
Run `npm run format` with all edited file paths before running `npm run validate:mobile`, `npm run validate:repo`, or `npm run lint`. This ensures code follows the project's style conventions.

### Agent Command Troubleshooting
Codex Desktop runs with workspace sandboxing and `zsh`, so a few repo commands need care:

- Quote Expo route paths that contain parentheses or brackets. For example, use `npm run format 'app/(tabs)/suits/add-fursuit.tsx' 'app/fursuits/[id]/edit.tsx'`; unquoted paths can fail with `zsh: no matches found`.
- `npm run validate:mobile` and `npm run validate:repo` run Expo Doctor, which contacts Expo APIs. If it fails with `fetch failed`, `getaddrinfo ENOTFOUND exp.host`, or React Native Directory network errors, rerun the same command with network escalation instead of debugging project config.
- Supabase CLI commands may try to write telemetry/config under `~/.supabase`, which is outside the workspace sandbox. If `supabase migration list`, `supabase migration up`, or similar commands fail with `EPERM ... ~/.supabase/telemetry.json`, rerun the same Supabase CLI command with escalation.
- `supabase db query` for the dev project should use the linked project flag, not `--project-ref`: `supabase db query --linked "<sql>"`. The CLI rejects `--project-ref` for this subcommand.
- `npm run gen:types` may need network access because it invokes `npx supabase@...`; if it fails with `getaddrinfo ENOTFOUND registry.npmjs.org`, rerun with network escalation. If it instead fails because `SUPABASE_ACCESS_TOKEN` is missing, stop retrying in Codex Desktop and ask Nick to run `npm run gen:types` locally.
- After schema changes, the reliable sequence is: apply the migration to dev with `supabase migration up --linked`, run `npm run gen:types`, format `src/types/database.ts`, then rerun `npm run validate:repo`.

## Coding Style & Naming Conventions
Use the surrounding file as the formatting source of truth and avoid unrelated reformatting. Prefer:

- `PascalCase` for React components and screen-level modules.
- `camelCase` for hooks, utilities, and helper functions.
- `kebab-case` for route folders, Supabase functions, and non-component filenames when already established.
- `@/` path-alias imports for application source modules from both `src/**` and `app/**` files. Prefer `@/features/...`, `@/components/...`, `@/lib/...`, `@/utils/...`, `@/theme`, and `@/types/...` over deep relative imports like `../../../src/...`.
- Relative imports are fine for nearby files in the same route/component folder, or for sibling files that are not under `src/`.
- `@/` path-alias re-exports in `src/**/index.ts` barrel files; avoid `./api`, `./storage`, or other relative barrel paths for sibling `src/` modules.

Linting is enforced with ESLint at the root and `next lint` in `admin/`. There is no repo-wide Prettier config, so keep diffs small and consistent with local style.

### Mobile Styling Convention
- Keep React Native styles out of mobile `*.tsx` files when practical. Prefer sibling `*.styles.ts` files for components in `src/`.
- Keep shared design tokens and reusable style primitives in `src/theme/`.
- Do not place style-only files under `app/`. Expo Router treats files in `app/` as routes, so route-level styles belong in the mirrored `src/app-styles/` tree instead.
- For route screens, mirror the `app/` directory structure inside `src/app-styles/` and import styles from there.
- Leave small dynamic style merges inline when extracting them would add indirection without reducing duplication.

## Testing Guidelines
At minimum, run `npm run validate:mobile` for mobile changes, `npm run validate:admin` for admin changes, `npm run validate:web` for web changes, and `npm run validate:repo` before PR handoff when Docker/Supabase local development is available. If you add tests, prefer colocated `*.test.ts(x)` files beside the feature they cover.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects such as `Remove Inngest implementation` and `Add cron-based achievement processor backup`, sometimes with issue references like `(#42)`. Follow that format. PRs should include a concise summary, linked issue if applicable, affected surfaces, and screenshots for UI changes.

Agents must never create commits under their own name or generated assistant identity. When making commits in this repository, always use `Finn the Panther <finn@finnthepanther.com>` for both the author and committer identities. Set repo-local `user.name` and `user.email`, or pass `GIT_COMMITTER_NAME="Finn the Panther" GIT_COMMITTER_EMAIL="finn@finnthepanther.com"` together with `git commit --author="Finn the Panther <finn@finnthepanther.com>"`.

When addressing PR review comments, verify each finding against the current code before editing. Fix only comments that are still valid, skip stale or already-resolved comments with a brief reason, and keep changes scoped to the review feedback. If the user asks to commit comment fixes, create one separate commit per distinct piece of feedback so each review comment can be traced to an individual change.

Codex Desktop may not have access to the GitHub CLI's macOS Keychain-backed auth token even when `gh auth status` passes in Nick's terminal. Prefer the GitHub connector for PR creation and PR metadata updates from Codex. Use `gh` only when it is already authenticated in the Codex environment or when the connector lacks the needed capability.

## Deploying Changes
1. **Mobile app:** Build via EAS (`eas build --profile [profile] --platform [platform]`)
2. **OTA updates:** Pushes to `dev` auto-publish to the `staging` EAS Update channel; pushes to `main` auto-publish to `production`. The CI splits mobile changes two ways: **JS-only** pushes (`app/`, `src/`, `assets/`, `packages/`, `package.json`, `package-lock.json`) ship via OTA alone when they do not require native project changes. **Native** pushes (`ios/`, `android/`, `app.config.ts`, `eas.json`) trigger both a full EAS Build and an OTA. Runtime version uses the `appVersion` policy, so **native pushes MUST include a `package.json` version bump** — the native version guard fails the workflow otherwise, preventing OTAs that would crash older binaries missing the new native modules. Changes to native-looking packages (`expo-*`, `@expo/*`, `react-native-*`, `@react-native/*`) must include generated native project changes from `expo prebuild` or an intentional EAS skip. Add `[skip eas]` to the merge commit to opt out of both paths and guards.
3. **Supabase Edge Functions:** `npx supabase functions deploy [function-name]`
4. **Database changes:** Apply migrations via Supabase CLI or dashboard. After any schema-affecting change (tables, views, functions/RPCs, enums, or generated-type-impacting policy changes), run `npm run gen:types` so `src/types/database.ts` stays in sync. If you believe types do not need to change, verify before finishing with `npm run validate:types:local` or `npm run validate:types:remote:dev`.
5. **Achievement rules:** Deploy edge function after updating `/packages/achievement-rules/`
6. **CI validation:** Ensure `npm run validate:repo` passes before merging to `dev`

## Supabase Environments
Unless explicitly stated, all changes, migrations, and Edge Function updates are to go to the **dev environment**:
- **Supabase Project Ref:** `rtxbvjicfxgcouufumce`
- **Project URL:** `https://rtxbvjicfxgcouufumce.supabase.co`

For any work that requires database changes, apply those changes to the dev environment using either the Supabase CLI or the Supabase MCP tooling (MCP is configured for dev only). Verify the target project before pushing migrations or schema changes. Never push database changes to staging or production unless explicitly instructed to do so.

### Supabase Tooling Policy
Use the Supabase MCP for hosted **dev** project inspection and lightweight operations: checking schema shape, table contents, policies, functions/RPCs, migration state, and dev-only data needed to understand or verify a change. Treat MCP output as live hosted-dev state, not as a replacement for committed migrations.

Use the Supabase CLI for repeatable schema and deployment workflows: starting/stopping the local stack, resetting local DB state from migrations and seeds, applying migrations to linked dev, generating database types, deploying Edge Functions, and explicitly linking to staging or production when approved. Prefer CLI commands for anything that should be reproducible by CI or another developer.

Use local Docker/OrbStack Supabase before shared dev when validating migration-backed work. The preferred flow is: write migration, run local reset/type validation, apply to linked dev, run `npm run gen:types`, format generated types, then validate. For tiny feature-flag row inserts, hosted dev inspection is fine, but schema/RPC/RLS changes should get local validation first.

Do not use the Supabase MCP for staging or production unless it has been explicitly reconfigured and approved for that environment. Current expectation is MCP = dev only; staging/production operations use deliberate CLI linking or dashboard workflows.

Database changes must leave generated types current before final validation or PR handoff. Prefer `npm run gen:types`, which preserves the manual aliases at the bottom of `src/types/database.ts`; otherwise run the explicit `supabase gen types` plus `scripts/check-types.py` verification command and note why no type update was needed. In Codex Desktop, do not repeatedly attempt these type-generation commands if they fail with `SUPABASE_ACCESS_TOKEN` missing; ask Nick to run `npm run gen:types` locally and continue once the resulting type files are available.

Only apply changes to other environments (staging, production) if explicitly instructed or after approval. When working in staging or production, the Supabase MCP tools are not configured for those environments — use the Supabase CLI instead by linking to the respective project (`supabase link --project-ref <staging-or-prod-ref>`) and applying changes there.

### Production Database Access via `psql`
For production database inspection, prefer direct Postgres access through read-only `psql` when Supabase CLI access is unavailable or unnecessary. Use this for targeted diagnostics only, not routine development. The local `.env.prod.local` file may provide:

- `TAILTAG_PROD_READONLY_POOLER_DATABASE_URL` for read-only production queries.
- `TAILTAG_PROD_MAINTENANCE_POOLER_DATABASE_URL` for approved production data fixes.

Use the read-only pooler URL by default:

```bash
set -a; source .env.prod.local; set +a
psql "$TAILTAG_PROD_READONLY_POOLER_DATABASE_URL"
```

Codex Desktop usually requires elevated command execution for these `psql` calls because outbound network access to Supabase is sandboxed. If a `psql` command fails with DNS, routing, or connection errors from the sandbox, rerun the same command with escalation. Keep production queries narrowly scoped, avoid selecting unnecessary personal data, and summarize findings without exposing secrets or large row dumps.

The production roles are expected to have `BYPASSRLS` so read-only diagnostics can see RLS-protected app rows. This does not replace table grants: continue using the read-only role for inspection and use the maintenance role only when the user explicitly asks for a direct production data change.

For production writes, always inspect first, use an explicit transaction, verify the affected rows before commit, and prefer `rollback` unless the requested change and verification are clear:

```sql
begin;
-- inspect target rows
-- update/insert/delete
-- verify exact result
commit;
```

## Security & Configuration Tips
Keep secrets out of source control. Mobile code expects `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; `admin/` also needs `SUPABASE_SERVICE_ROLE_KEY` for server actions. Treat generated native folders (`ios/`, `android/`) and database types carefully, and update Supabase migrations instead of patching production schema by hand.
