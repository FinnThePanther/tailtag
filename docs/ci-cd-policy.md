# CI/CD Policy

This document defines the required GitHub branch protection and CI check policy for TailTag.

## Branch protection policy

Apply branch protection to both `dev` and `main`.

### Required settings (both branches)

- Require a pull request before merging.
- Require at least 1 approval.
- Dismiss stale approvals when new commits are pushed.
- Require review from Code Owners if a matching `CODEOWNERS` rule exists.
- Require conversation resolution before merging.
- Require status checks to pass before merging.
- Do not allow force pushes.
- Do not allow branch deletion.

### Required status checks (both branches)

- `Validate repository` (from `.github/workflows/ci.yml`)

This is the mandatory quality gate for merges into protected branches.

## CI workflow responsibilities

- `.github/workflows/ci.yml`:
  - Runs on pull requests and is the required merge check.
  - Validates GitHub workflow syntax with `actionlint`.
  - Validates Expo doctor, formatting, linting, type checking, migration file naming/uniqueness, and generated Supabase type drift.
  - Fails PRs that change native-looking dependencies without native project/config changes.
  - Forces JavaScript-based GitHub actions to execute on Node 24 to surface deprecation-window compatibility issues early.

- `.github/workflows/branch-delivery.yml`:
  - Runs on pushes to `dev` and `main` after merge.
  - Uses static job names so GitHub check labels stay readable.
  - Deploys backend changes to staging (`dev`) or production (`main`).
  - Runs a preflight migration drift check before `supabase db push` and fails with remediation guidance if remote migration history is missing locally committed files.
  - Triggers OTA updates and, when native surfaces change, EAS native builds.
  - Enforces `package.json` version bumps for native changes unless EAS delivery is explicitly skipped.
  - Fails `dev` -> `main` release PRs that were squash/rebase merged instead of merge-committed.
  - Waits for production EAS native builds to finish before tagging the release. Staging native builds remain fire-and-forget.
  - Automatically creates production mobile release tags on `main` after successful delivery.

- `.github/workflows/branch-sync.yml`:
  - Runs daily and on demand.
  - Fails when `origin/main` is not an ancestor of `origin/dev`, which catches missed post-release fast-forwards.

All third-party GitHub Actions in these workflows are pinned to commit SHAs.

## Commit-message delivery overrides

The branch-delivery workflow honors the following merge commit directives:

- `[skip eas]`
- `[skip-eas]`
- `[eas skip]`
- `[no eas]`
- `[no-eas]`

When present, EAS build/update jobs and the native version-bump guard are skipped for that push.

## Operational guidance

- Keep `Validate repository` green on PRs before merge.
- Treat `dev` as the staging delivery branch and `main` as production delivery.
- Use `docs/runbooks/release-management.md` for production release tags, app version bumps, and post-release `dev`/`main` synchronization.
- Use EAS skip directives only for intentional exceptions and document the reason in the PR description.

## Release enforcement boundaries

The native version-bump guard is path-based. It currently treats `ios/**`,
`android/**`, `app.config.ts`, and `eas.json` as native/runtime surfaces.

`package.json` and `package-lock.json` are treated as JS surfaces by default so
pure JS dependency updates can ship by OTA without forcing a native rebuild. CI
also scans `package.json` for native-looking package changes such as `expo-*`,
`@expo/*`, `react-native-*`, and `@react-native/*`. If one changes without
native project/config changes, CI fails and asks for the generated native diff or
an intentional EAS skip.

Release tags are automatic for mobile deliveries on `main` only. Native/runtime
releases create `v<package.json version>`. JS-only OTA releases create the next
`v<package.json version>-ota.N` tag. Backend-only, web-only, skipped-EAS, and
`dev` deliveries are not tagged.
