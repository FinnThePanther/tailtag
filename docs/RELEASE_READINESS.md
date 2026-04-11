# Release Readiness

Updated: 2026-04-08

Purpose: track the pre-release fixes needed before the first external TestFlight / Google Play testing build.

## Status

- [x] Fix 1: Native app identity must support `development`, `staging`, and `production`
- [x] Fix 2: Android release manifest / native build permissions should be trimmed for store readiness
- [x] Fix 3: In-app feedback link should point to a live form
- [x] Fix 4: Website distribution links should be replaced with real platform links
- [x] Fix 5: Minor tester-facing polish in onboarding and catch flow

## Details

### Fix 1

Problem:
- The repo had environment-aware Expo config, but checked-in/generated native files could drift and ship the wrong branding / package IDs.

Done:
- Added shared environment config in [scripts/native-env.config.cjs](/Users/nick/Documents/dev/tailtag/scripts/native-env.config.cjs)
- Added native sync script in [scripts/sync-native-env.cjs](/Users/nick/Documents/dev/tailtag/scripts/sync-native-env.cjs)
- Updated [app.config.ts](/Users/nick/Documents/dev/tailtag/app.config.ts) to use the same environment map
- Added local run / prebuild / production build helpers in [package.json](/Users/nick/Documents/dev/tailtag/package.json)
- Added support for environment-specific Firebase Android config files

Current expected app IDs:
- `development`: `com.finnthepanther.tailtag.dev`
- `staging`: `com.finnthepanther.tailtag.staging`
- `production`: `com.finnthepanther.tailtag`

Notes:
- Android Firebase JSON files are present for all three environments.
- iOS Firebase plist files are not currently required for the existing Expo push setup.

### Fix 2

Problem:
- Android manifest / native build setup still needs a release-oriented review for permissions and debug-oriented residue before wider external testing.

Done:
- Confirmed the app uses camera, photo library, location, NFC, and push permissions
- Confirmed the app does not use audio recording, system alert windows, or write settings flows
- Added Android blocked permissions in [app.config.ts](/Users/nick/Documents/dev/tailtag/app.config.ts) to remove:
  - `android.permission.RECORD_AUDIO`
  - `android.permission.READ_EXTERNAL_STORAGE`
  - `android.permission.WRITE_EXTERNAL_STORAGE`
  - `android.permission.SYSTEM_ALERT_WINDOW`
  - `android.permission.WRITE_SETTINGS`

Follow-up:
- Rebuild or prebuild once and verify the merged Android release manifest only contains required permissions

### Fix 3

Problem:
- The feedback form URL in settings was returning `404`.

Done:
- Replaced the dead feedback link in [app/(tabs)/settings.tsx](/Users/nick/Documents/dev/tailtag/app/%28tabs%29/settings.tsx) with the live form:
  - `https://forms.gle/e65DqKt1VsuvoFTx8`

Follow-up:
- Verify it opens correctly on device via the Settings screen

### Fix 4

Problem:
- Website distribution links still use placeholders.

Done:
- Updated the platform CTA links in [web/src/config/site.ts](/Users/nick/Documents/dev/tailtag/web/src/config/site.ts):
  - `ios`: `https://finnthepanther.com`
  - `android`: `https://finnthepanther.com`
  - `discord`: `https://discord.gg/Fv7NPJNTP2`

Follow-up:
- Verify the landing-site CTA flow matches the intended public distribution path

### Fix 5

Problem:
- A few tester-facing UI strings still look unfinished.

Done:
- Corrected the notifications onboarding step from `Step 5` to `Step 4` in [src/features/onboarding/components/NotificationsStep.tsx](/Users/nick/Documents/dev/tailtag/src/features/onboarding/components/NotificationsStep.tsx)
- Hid the tester-facing NFC “coming soon” message in [app/(tabs)/catch.tsx](/Users/nick/Documents/dev/tailtag/app/%28tabs%29/catch.tsx)

## Suggested Order

1. Fix 2
2. Fix 3
3. Fix 5
4. Fix 4
5. Build and smoke test `staging`
6. Build and smoke test `production`

## Validation Checklist

- [ ] `development` build installs and uses dev app ID / backend
- [ ] `staging` build installs and uses staging app ID / backend
- [ ] `production` build resolves production app ID / backend
- [ ] Sign-in works on iOS and Android
- [ ] Onboarding works end to end
- [ ] Push registration works
- [ ] Expo/EAS push credentials are configured for `development`, `staging`, and `production`
- [ ] Catch creation works
- [ ] Pending catch approval processes achievements immediately
- [ ] Feedback/report path works

## Follow-up Fixes

### 2026-04-08: Pending Catch Achievement Lag

Problem:
- Accepting a pending catch could delay achievement processing by roughly 45 seconds because the `confirm_catch` RPC enqueued gameplay events but did not wake `process-gameplay-queue` immediately.

Done:
- Added migration [20260408114500_wake_gameplay_queue_after_confirm_catch.sql](/Users/nick/Documents/dev/tailtag/supabase/migrations/20260408114500_wake_gameplay_queue_after_confirm_catch.sql)
- Updated `public.confirm_catch(...)` to call `public.process_gameplay_queue_if_active()` after enqueueing accepted-catch events
- Wrapped the queue wake in an exception-safe block so catch approval still succeeds even if the wakeup call fails

Follow-up:
- Re-test a photo/manual-approval catch in `development`
- Confirm the catcher sees achievement notifications and achievement-screen updates within a few seconds of approval

### 2026-04-08: Multi-Environment Push Notification Setup

Problem:
- The app is successfully registering Expo push tokens in `development`, and the dev Supabase project is successfully calling the `send-push` function, but dev devices are still not reliably receiving notifications.
- That means the remaining gaps are likely downstream delivery credentials/capabilities rather than client-side token registration.

Done:
- Updated [supabase/functions/send-push/index.ts](/Users/nick/Documents/dev/tailtag/supabase/functions/send-push/index.ts) to:
  - include `channelId: "default"` for Android delivery
  - persist Expo ticket-level errors into `push_notification_retry_queue` and `admin_error_log` instead of only printing them to console
- Deployed the updated `send-push` function to the connected dev Supabase project
- After push credentials were fixed, reverted the temporary Android/Expo priority bump back to normal delivery priority

Manual follow-up:
- Expo/EAS push credentials still need to be verified outside the repo for each environment.
- iOS:
  - Ensure Push Notifications capability is enabled in Apple Developer for:
    - `com.finnthepanther.tailtag.dev`
    - `com.finnthepanther.tailtag.staging`
    - `com.finnthepanther.tailtag`
  - Regenerate provisioning profiles after enabling push
  - Ensure Expo/EAS has APNs credentials available for the project
- Android:
  - Ensure Expo/EAS has the Firebase Cloud Messaging server credentials configured for the project
  - Keep the environment-specific `google-services.*.json` files in sync with the matching package IDs

Validation:
- Trigger a fresh notification in `development`
- If it still does not arrive, check:
  - `public.admin_error_log`
  - `public.push_notification_retry_queue`
- Any Expo ticket-level delivery failure should now be visible there instead of being silent
