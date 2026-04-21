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
  - Validates Expo doctor, formatting, linting, type checking, migration file naming/uniqueness, and generated Supabase type drift.
  - Runs a non-blocking Node 24 readiness pass (`Validate repository (Node 24 readiness)`).
  - Forces JavaScript-based GitHub actions to execute on Node 24 to surface deprecation-window compatibility issues early.

- `.github/workflows/branch-delivery.yml`:
  - Runs on pushes to `dev` and `main` after merge.
  - Deploys backend changes to staging (`dev`) or production (`main`).
  - Runs a preflight migration drift check before `supabase db push` and fails with remediation guidance if remote migration history is missing locally committed files.
  - Triggers OTA updates and, when native surfaces change, EAS native builds.
  - Enforces `package.json` version bumps for native changes unless EAS delivery is explicitly skipped.

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
- Use EAS skip directives only for intentional exceptions and document the reason in the PR description.
