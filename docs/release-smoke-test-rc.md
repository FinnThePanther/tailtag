# TailTag Production RC Smoke Test

Linear: TAILTAG-135
Date: 2026-06-06
Environment: production
Tester: Codex

## Scope Notes

- Testing is performed with emulator-compatible production-environment builds.
- Store-profile build configuration is verified separately because iOS store archives and Android AABs are not directly installable on emulators.
- Temporary production test data must be removed through app/account cleanup flows where possible.

## Build And Configuration

| Check | Result | Evidence |
| --- | --- | --- |
| Production release config verification | Pass | `npm run verify:production-release` passes after syncing production native identity and version metadata. |
| Mobile validation | Pass | `npm run ci:validate` passed after fixing `EnvironmentBanner` hook order. |
| Expo public config resolves production identity | Pass | `APP_ENV=production npx expo config --type public` resolves `TailTag`, `com.finnthepanther.tailtag`, production Supabase, runtime `0.1.11`, and production update channel. |
| Recent EAS production builds reviewed | Pass | Latest EAS production builds are finished: iOS build `918f7aa7-1967-4598-8b55-37d14fe38321`, Android build `5ab48e8d-1a73-4772-9196-78af621738d9`, both app version `0.1.11`, runtime `0.1.11`, channel `production`. |
| iOS emulator production-environment build installed | Pass | `APP_ENV=production npx expo run:ios --device AA454285-0B95-475B-935C-CBDBD6F012D8 --configuration Release --no-bundler` built, installed, and launched `com.finnthepanther.tailtag`; `com.finnthepanther.tailtag.dev` was absent. |
| Android emulator production-environment build installed | Pass | `APP_ENV=production android/gradlew -p android :app:assembleRelease` built successfully; release APK installed and launched as `com.finnthepanther.tailtag` with `versionName=0.1.11`. |

## App Smoke Matrix

| Area | iOS | Android | Notes |
| --- | --- | --- | --- |
| App launches without crash | Pass | Pass | iOS and Android production app IDs launch. Android renders the auth screen and post-onboarding tab shell. iOS Release simulator build installed and launched under `com.finnthepanther.tailtag` on iPhone 16 Pro. |
| Email/password sign-up | Pending | Pass | Android production APK created temporary user `tailtagrc1351780786209@example.com` through the UI and returned an authenticated session. |
| OAuth sign-in surfaces are available | Partial | Pass | Android auth screen shows Google and Discord. iOS auth screen shows Apple/Google/Discord. Full provider callback auth is not expected to complete in emulators without reviewer credentials. |
| Sign-up policy acceptance is visible/enforced | Pending | Pass | Android signup screen shows required 13+ / Terms / Privacy / Child Safety checkbox and disables Sign up until completion. |
| Onboarding age/visibility flow | Pending | Pass | Android completed under-18 age gate, verified 18+ fursuit visibility is disabled, and completed onboarding summary. |
| Profile completion | Pending | Pass | Android Settings rendered username, bio, profile photo, catch settings, profile visibility, age attestation, convention attendance, push notifications, legal/privacy, and account controls for a post-onboarding user. |
| Social links | Pending | Pass | Android Settings social links editor saved disposable handle `rc135_test` and returned `Social links saved`. |
| Fursuit creation | Pending | Pass | Android created temporary fursuit `RC135SuitDragon CT CT CT CT` with species `Dragon`, color `Pink`, and convention roster listing. |
| Fursuit edit | Pending | Pass | Android opened fursuit detail, opened Edit, changed the disposable fursuit name, saved, and detail reflected `RC135 Suit 5988Edit`. |
| Photo upload from gallery | Pending | Partial | Android fursuit edit opened the system photo picker. Upload could not complete because the emulator gallery had no media. |
| Camera permission/capture path | Pending | Blocked | Catch camera action is present but disabled until a convention is active. Emulator can only verify disabled state today. |
| Catch code flow | Pending | Blocked | Android Catch tab accepted known code `RC435988`, but `Record catch` remained disabled because production `Texas Furry Siesta 2026` starts 2026-06-19. |
| Camera catch flow | Pending | Blocked | Android Catch tab renders `Open Camera`, but it is disabled until catching opens for an active convention. |
| Gallery catch flow | Pending | Blocked | Android Catch tab renders `Choose from Gallery`, but it is disabled until catching opens for an active convention. |
| Pending catch approval | Pending | Blocked | Requires submitting a catch during an active playable convention. |
| Report controls on profile/fursuit/catch | Pending | Pass | Android public fursuit deep link rendered `Content actions`; `Report fursuit` opened report UI and submitted a disposable report with native success confirmation. Catch report controls still need catch data. |
| Block controls | Pending | Pass | Android public fursuit `Content actions` opened `Block owner` confirmation and returned native `Blocked` confirmation. |
| Blocked user behavior | Pending | Pass | Android owner profile deep link showed `Profile unavailable` after blocking owner from catcher account. |
| Account deletion | Pending | Pass | Android Settings destructive `Delete account` flow showed native confirmation, called production deletion, showed `Account Deleted`, and returned to auth. |
| Foreground location verification | Pending | Blocked | Android Settings convention card shows `Location check when catching opens` and `STARTS 6/19/2026`; verification cannot run before active event window. |
| Push opt-in/out UI | Pending | Pass | Android Settings Push Notifications card shows disabled emulator state: `Push notifications require a physical device` and system settings disabled. |
| Push delivery | Pending | Blocked | Requires physical device push token and delivery path; emulator only verifies unavailable UI state. |
| OTA channel alignment | Pass | Pass | Expo config, native strings, and EAS builds show production channel/runtime `0.1.11`; emulator builds install production app IDs. |

## Backend And Admin

| Check | Result | Evidence |
| --- | --- | --- |
| Production Supabase reachable from app config | Pass | Production Expo config resolves `https://api.playtailtag.com`. |
| Production auth accepts temporary test user | Pass | Temporary user `tailtagrc1351780786209@example.com` was created through the Android production UI and returned a session. |
| Storage upload/read works | Partial | Fursuit edit opened Android system photo picker, but no media was available in the emulator gallery to complete upload/read. |
| Edge Functions used by tested flows work | Pass | `delete-account` production Edge Function returned `200` for app-created disposable users, including the Android Settings account deletion flow. |
| Report/moderation item reaches admin path | Partial | Android submitted a disposable fursuit report and received `Report submitted`; admin review UI was not retested in this pass. |
| Cleanup completed | Pass | Android Settings deleted catcher account. Remaining owner/failed setup accounts were deleted through production `delete-account`; already-deleted/non-created users returned auth failures and were skipped. |

## Blockers

- No remaining TAILTAG-138/TAILTAG-139 native identity/version blockers after the 2026-06-06 retest.
- TAILTAG-135 is blocked from full completion by date/device constraints: production catching and foreground location verification cannot run until `Texas Furry Siesta 2026` starts on 2026-06-19, and push delivery needs a physical device. iOS still needs a full interactive account/onboarding pass.

## Non-Blockers

- Android emulator UI automation with `adb input` is brittle for long signup forms. Use a manual emulator pass, Maestro/Detox, or a real device for remaining interactive iOS and media-upload coverage.
- Local Android Release build now uploads Sentry source maps as `com.finnthepanther.tailtag@0.1.11+1`.
- iOS Release simulator build installed and launched cleanly under the production bundle ID, but the interactive account/onboarding pass still needs to be run separately.
