# Repository Guidelines

## Project Structure & Module Organization
`tailtag` is a TypeScript monorepo. The mobile app lives in `app/` and `src/`. The admin dashboard is in `admin/`, the landing site is in `web/`, shared rule logic is in `packages/achievement-rules/`, and backend work is in `supabase/` with migrations in `supabase/migrations/` and Edge Functions in `supabase/functions/`.

## Build, Test, and Development Commands
Use `npm install` at the repo root, then run commands from the relevant app directory.

- `npm run start` from the root starts the Expo app.
- `npm run ios` / `npm run android` from the root run native Expo builds locally.
- `npm run lint` and `npm run typecheck` from the root validate the mobile app.
- `npm run ci:validate` from the root runs Expo doctor, lint, and type checking together.
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
Run `npm run format` with all edited file paths before running `npm run ci:validate` or `npm run lint`. This ensures code follows the project's style conventions.

## Coding Style & Naming Conventions
Use the surrounding file as the formatting source of truth and avoid unrelated reformatting. Prefer:

- `PascalCase` for React components and screen-level modules.
- `camelCase` for hooks, utilities, and helper functions.
- `kebab-case` for route folders, Supabase functions, and non-component filenames when already established.

Linting is enforced with ESLint at the root and `next lint` in `admin/`. There is no repo-wide Prettier config, so keep diffs small and consistent with local style.

### Mobile Styling Convention
- Keep React Native styles out of mobile `*.tsx` files when practical. Prefer sibling `*.styles.ts` files for components in `src/`.
- Keep shared design tokens and reusable style primitives in `src/theme/`.
- Do not place style-only files under `app/`. Expo Router treats files in `app/` as routes, so route-level styles belong in the mirrored `src/app-styles/` tree instead.
- For route screens, mirror the `app/` directory structure inside `src/app-styles/` and import styles from there.
- Leave small dynamic style merges inline when extracting them would add indirection without reducing duplication.

## Testing Guidelines
There is no committed automated test suite yet. At minimum, run `npm run ci:validate` for mobile changes, `cd admin && npm run lint`, and the relevant production build for `admin/` or `web/`. If you add tests, prefer colocated `*.test.ts(x)` files beside the feature they cover.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects such as `Remove Inngest implementation` and `Add cron-based achievement processor backup`, sometimes with issue references like `(#42)`. Follow that format. PRs should include a concise summary, linked issue if applicable, affected surfaces, and screenshots for UI changes.

## Deploying Changes
1. **Mobile app:** Build via EAS (`eas build --profile [profile] --platform [platform]`)
2. **OTA updates:** Pushes to `dev` auto-publish to the `staging` EAS Update channel; pushes to `main` auto-publish to `production`. The CI splits mobile changes two ways: **JS-only** pushes (`app/`, `src/`, `assets/`, `packages/`, `package.json`, `package-lock.json`) ship via OTA alone when they do not require native project changes. **Native** pushes (`ios/`, `android/`, `app.config.ts`, `eas.json`) trigger both a full EAS Build and an OTA. Runtime version uses the `appVersion` policy, so **native pushes MUST include a `package.json` version bump** — the native version guard fails the workflow otherwise, preventing OTAs that would crash older binaries missing the new native modules. Changes to native-looking packages (`expo-*`, `@expo/*`, `react-native-*`, `@react-native/*`) must include generated native project changes from `expo prebuild` or an intentional EAS skip. Add `[skip eas]` to the merge commit to opt out of both paths and guards.
3. **Supabase Edge Functions:** `npx supabase functions deploy [function-name]`
4. **Database changes:** Apply migrations via Supabase CLI or dashboard
5. **Achievement rules:** Deploy edge function after updating `/packages/achievement-rules/`
6. **CI validation:** Ensure `npm run ci:validate` passes before merging to `dev`

## Supabase Environments
Unless explicitly stated, all changes, migrations, and Edge Function updates are to go to the **dev environment**:
- **Supabase Project Ref:** `rtxbvjicfxgcouufumce`
- **Project URL:** `https://rtxbvjicfxgcouufumce.supabase.co`

For any work that requires database changes, apply those changes to the dev environment using the Supabase CLI or the MCP if it is already configured. Verify the CLI/MCP target before pushing migrations or schema changes. Never push database changes to staging or production unless explicitly instructed to do so.

Only apply changes to other environments (staging, production) if explicitly instructed or after approval.

## Security & Configuration Tips
Keep secrets out of source control. Mobile code expects `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; `admin/` also needs `SUPABASE_SERVICE_ROLE_KEY` for server actions. Treat generated native folders (`ios/`, `android/`) and database types carefully, and update Supabase migrations instead of patching production schema by hand.
