# Release Management

Use this runbook when promoting TailTag changes from `dev` to `main` and when
checking Git tags for production mobile releases.

## Branch model

- `dev` is the staging delivery branch.
- `main` is the production delivery branch.
- Feature PRs merge into `dev` first.
- Production releases are batched by opening a `dev` -> `main` PR.
- After the release PR merges, fast-forward `dev` to `main` so the release merge
  commit does not leave the branches diverged.

```bash
git switch dev
git pull --ff-only origin dev
git fetch origin
git merge --ff-only origin/main
git push origin dev
```

Do not squash or cherry-pick routine `dev` -> `main` releases. Squash merges and
cherry-picks create new SHAs on `main`, which makes Git unable to recognize that
`main` already contains the same changes from `dev`. Use cherry-picks only for
hotfixes or intentionally partial releases.

## Version policy

`package.json.version` is the native app version. `app.config.ts` reads that
value into Expo's `version`, and Expo Updates uses `runtimeVersion: { policy:
'appVersion' }`.

Because the runtime version follows the app version:

- Bump `package.json.version` only when a release includes native/runtime changes.
- Do not bump `package.json.version` for JS-only OTA releases.
- Do not publish an OTA built from JS that depends on native code not present in
  the installed binary.

Native/runtime changes include:

- `ios/**`
- `android/**`
- `app.config.ts`
- `eas.json`
- native module dependency changes that require a new prebuild/native binary

JS-only OTA changes usually include:

- `app/**`
- `src/**`
- `assets/**`
- `packages/**` when rule logic remains compatible with the installed runtime
- `package.json` / `package-lock.json` changes that do not add or change native
  modules

## Tag policy

The Delivery workflow automatically tags production mobile releases on `main`
after validation, production delivery, EAS update publication, and any required
production EAS native build complete successfully.

Native binary release tags:

```text
v<app-version>
```

Examples:

```text
v0.1.0
v0.1.1
v0.2.0
```

OTA release tags for the same native app version:

```text
v<app-version>-ota.<n>
```

Examples:

```text
v0.1.0-ota.1
v0.1.0-ota.2
v0.1.1-ota.1
```

Pre-production test build tags may use:

```text
v<app-version>-test.<n>
```

Use `-test.<n>` only for TestFlight, Google Play internal testing, or other
non-production release candidates. Once a commit is promoted as the production
baseline for an app version, add the production tag (`v<app-version>`) to the
production commit.

Automation rules:

- Native/runtime releases on `main` create `v<app-version>`.
- JS-only OTA releases on `main` create the next available
  `v<app-version>-ota.<n>` tag.
- Releases on `dev` are not tagged.
- Backend-only or web-only production deploys are not tagged.
- Production pushes with an EAS skip directive are not tagged.
- Production native build tags are created only after EAS reports a successful
  production build.
- If `v<app-version>` already exists at a different commit, the tag job fails.
  Bump `package.json.version` or resolve the tag before re-running production
  delivery.

## Standard production release

1. Verify `dev` is green and staging has passed smoke testing.

```bash
npm run ci:validate
./scripts/verify-environment.sh staging
```

2. Decide whether the release is native or OTA-only.

If native/runtime files changed, bump the app version on `dev` before the release
PR:

```bash
npm version patch --no-git-tag-version
npm run format package.json package-lock.json
git add package.json package-lock.json
git commit -m "Bump app version to <version>"
git push origin dev
```

If the release is JS-only, do not bump `package.json.version`.

3. Open and merge a `dev` -> `main` PR using a merge commit. Do not squash or
   rebase release PRs; the Delivery workflow blocks `dev` -> `main` release PRs
   that are not merge commits.

```bash
gh pr create --base main --head dev --title "Release: <date>" --body "..."
```

4. Wait for the production Delivery workflow to pass. On `main`, the workflow
   creates the release tag automatically for native and JS-only mobile releases.

5. Verify the tag if needed.

For a native release:

```bash
git fetch origin
git show-ref --tags v<app-version>
```

For an OTA-only release:

```bash
git fetch origin
git tag --list 'v<app-version>-ota.*' --sort=-version:refname
```

6. Fast-forward `dev` to `main`.

```bash
git switch dev
git pull --ff-only origin dev
git merge --ff-only origin/main
git push origin dev
```

## Hotfix release

For urgent production fixes, branch from `main`, merge back to `main`, then
back-port or fast-forward `dev` as appropriate.

```bash
git switch main
git pull --ff-only origin main
git switch -c hotfix/<short-name>
# fix, validate, push, open PR to main
```

After the hotfix merges and production delivery succeeds:

```bash
git switch dev
git pull --ff-only origin dev
git merge --ff-only origin/main || git merge origin/main
git push origin dev
```

Use a normal merge only if `dev` already has unreleased commits and cannot be
fast-forwarded to `main`.

## CI/CD enforcement

The Delivery workflow currently enforces the native version rule for changes to
`ios/**`, `android/**`, `app.config.ts`, and `eas.json` unless an EAS skip
directive is present in the merge commit message.

On `main`, the workflow automatically creates production release tags for mobile
deliveries. It creates `v<app-version>` for native/runtime releases and the next
`v<app-version>-ota.<n>` tag for JS-only OTA releases.

The workflow treats `package.json` and `package-lock.json` as JS surfaces by
default. If `package.json` changes native-looking packages (`expo-*`, `@expo/*`,
`react-native-*`, or `@react-native/*`) without native project/config changes,
CI fails. Run `expo prebuild` and include the resulting native project changes,
or use an EAS skip directive for an intentional exception.

The Branch Sync workflow runs daily and fails if `dev` does not contain `main`.
Treat that as a missed post-release fast-forward.
