# TailTag Store Compliance Package

Last updated: June 6, 2026

Use this package when completing App Store Connect and Play Console compliance
forms for the first full TailTag app-store release. Re-check it before
submission if the app adds SDKs, changes permissions, enables new telemetry, or
changes account deletion, moderation, location, push, photo, or UGC
behavior.

Primary references:

- Apple App Privacy:
  https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy/
- Google Play Data safety:
  https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play account deletion:
  https://support.google.com/googleplay/android-developer/answer/13327111

## App Identity And Public Policy Values

| Field | Value |
| --- | --- |
| App name | TailTag |
| Privacy Policy URL | `https://playtailtag.com/privacy` |
| Account deletion URL | `https://playtailtag.com/delete-account` |
| Support email | `finn@finnthepanther.com` |
| Intended audience | Users 13 and older; TailTag is not directed to children under 13 |
| Ads | No ads |
| Tracking | No cross-app or cross-site advertising tracking |
| Sale of personal information | No sale of personal information |
| Encryption in transit | Yes, TailTag uses encrypted network connections |
| Account deletion | Yes, in-app deletion plus public web deletion request path |
| UGC posture | User-generated profiles, fursuit listings, photos, catch submissions, report text, and support text are allowed only under TailTag policies |
| Adult-content posture | Adult, sexual, pornographic, dating, matchmaking, hookup, grooming, CSAM, CSAE, harassment, bullying, and illegal content or conduct are prohibited |
| 18+ visibility | Privacy boundary only; it does not permit adult or sexual content |

## Apple App Privacy Answers

Overall App Store Connect answers:

- Data collected: Yes.
- Tracking: No.
- Third-party partner collection included: Yes. Include integrated SDKs and
  service providers.
- Data linked to user: Yes for account, profile, gameplay, push, location
  verification, moderation, legal acceptance, and Sentry events that include
  user context.
- Privacy Policy URL: `https://playtailtag.com/privacy`
- User Privacy Choices URL: `https://playtailtag.com/delete-account`

Recommended Apple data types:

| Apple data type | Collect? | Linked to user? | Purposes |
| --- | --- | --- | --- |
| Contact Info - Email Address | Yes | Yes | App Functionality, Account Management, Customer Support |
| Contact Info - Name | Yes, when provided by an auth provider or profile/display name | Yes | App Functionality, Account Management |
| Identifiers - User ID | Yes | Yes | App Functionality, Account Management, Analytics, Developer Communications, App Security |
| Identifiers - Device ID | Yes, through platform, Expo, Sentry, push, or diagnostics where applicable | Yes when tied to account or session | App Functionality, Analytics, App Security |
| User Content - Photos or Videos | Yes | Yes | App Functionality, Customer Support, App Security |
| User Content - Gameplay Content | Yes | Yes | App Functionality, Analytics, App Security |
| User Content - Other User Content | Yes | Yes | App Functionality, Customer Support, App Security |
| Location - Precise Location | Yes, only for user-initiated convention verification | Yes | App Functionality, App Security |
| Usage Data - Product Interaction | Yes, through gameplay records, app events, and diagnostics | Yes | App Functionality, Analytics, App Security |
| Diagnostics - Crash Data | Yes | Yes when Sentry user context is attached | Analytics, App Functionality |
| Diagnostics - Performance Data | Yes | Yes when Sentry user context is attached | Analytics, App Functionality |
| Diagnostics - Other Diagnostic Data | Yes | Yes when Sentry user context is attached | Analytics, App Functionality, App Security |
| Other Data - Legal or policy acceptance | Yes | Yes | App Functionality, Account Management, App Security |

Apple notes:

- Do not mark data as used for Third-Party Advertising or Developer's
  Advertising or Marketing.
- Do not mark tracking as Yes unless a later SDK review finds cross-company
  advertising tracking.
- Location is collected because precise coordinates are transmitted to TailTag's
  backend for convention geofence verification. TailTag does not continuously
  track background location.
- Sentry replay is not enabled for production builds. If replay is enabled later,
  update the privacy policy, this package, and store declarations before
  shipping.

## Google Play Data Safety Answers

Top-level Data safety answers:

- Does the app collect or share required user data types? Yes.
- Is all collected user data encrypted in transit? Yes.
- Does the app provide a way for users to request data deletion? Yes.
- Does the app provide account deletion inside the app? Yes,
  `Settings -> Profile & account -> Delete account`.
- Does the app provide account deletion outside the app? Yes,
  `https://playtailtag.com/delete-account`.
- Is the app committed to follow the Families Policy? No. TailTag is not
  directed to children under 13.
- Independent security review: No, unless a MASA or equivalent review is
  completed later.

Recommended Google data types:

| Google data type | Collect/share | Required or optional | Purposes |
| --- | --- | --- | --- |
| Location - Precise location | Collected, not shared for ad/third-party business purposes | Optional unless joining a geofence-required convention | App functionality, Fraud prevention/security/compliance |
| Location - Approximate location | Collected if Android coarse location permission remains available, not shared for ad/third-party business purposes | Optional unless joining a geofence-required convention | App functionality, Fraud prevention/security/compliance |
| Personal info - Name | Collected, not shared for ad/third-party business purposes | Optional for profile/display name; may be provided by OAuth | App functionality, Account management |
| Personal info - Email address | Collected, not shared for ad/third-party business purposes | Required for account/auth flows | Account management, App functionality, Developer communications, Fraud prevention/security/compliance |
| Personal info - User IDs | Collected, not shared for ad/third-party business purposes | Required for account use | Account management, App functionality, Analytics, Fraud prevention/security/compliance |
| Photos and videos - Photos | Collected, not shared for ad/third-party business purposes | Optional per upload | App functionality, Fraud prevention/security/compliance |
| App activity - App interactions | Collected, not shared for ad/third-party business purposes | Required for app functionality and diagnostics | App functionality, Analytics, Fraud prevention/security/compliance |
| App activity - Other user-generated content | Collected, not shared for ad/third-party business purposes | Optional for bios, social links, report text, and support details | App functionality, Account management, Fraud prevention/security/compliance |
| App activity - Other actions | Collected, not shared for ad/third-party business purposes | Required for gameplay features | App functionality, Analytics, Fraud prevention/security/compliance |
| App info and performance - Crash logs | Collected, not shared for ad/third-party business purposes | Required for diagnostics | Analytics, App functionality |
| App info and performance - Diagnostics | Collected, not shared for ad/third-party business purposes | Required for diagnostics | Analytics, App functionality, Fraud prevention/security/compliance |
| App info and performance - Other app performance data | Collected, not shared for ad/third-party business purposes | Required for diagnostics | Analytics, App functionality |
| Device or other IDs | Collected, not shared for ad/third-party business purposes | Required for push, auth/session, and diagnostics where applicable | App functionality, Analytics, Fraud prevention/security/compliance, Developer communications |

Google Play notes:

- Treat Supabase, Expo, and Sentry as service providers/processors acting on
  TailTag's behalf unless current Play Console or provider guidance requires a
  different answer.
- User-initiated OAuth with Apple, Google, or Discord is a user-requested
  provider action. Re-check provider guidance before final submission.
- Avoid Advertising or marketing and Personalization purposes unless product
  behavior changes.
- Android release permissions include both `ACCESS_FINE_LOCATION` and
  `ACCESS_COARSE_LOCATION`, so include both precise and approximate location.
- Mark deletion as supported for account and associated account data, with
  limited retention for safety, legal compliance, audit history, support
  tracking, service integrity, or operational backups.

## Content Rating Guidance

Answer content rating questionnaires to reflect TailTag's actual product
posture:

- TailTag includes UGC/social features: user profiles, fursuit listings, photos,
  catch submissions, report text, support text, leaderboards, and convention
  participation.
- TailTag is not a dating, matchmaking, hookup, random chat, adult-content, or
  monetized UGC service.
- Adult, sexual, pornographic, grooming, CSAM, CSAE, harassment, bullying, and
  illegal content or conduct are prohibited by the Terms and Child Safety
  Standards.
- Users must accept TailTag's Terms, Privacy Policy, and Child Safety Standards
  before creating an account or uploading UGC.
- Users can report profiles, fursuits, and catch content in-app, and can block
  other users.
- TailTag staff can review reports, resolve or dismiss reports with notes,
  restrict content or features where supported, suspend accounts, and respond to
  child safety reports through the published support path.
- 18+ visibility only limits profile/fursuit visibility to users who have
  declared they are 18 or older. It does not allow adult or sexual content.

## Paste-Ready Review Notes

Use this in App Store Connect App Review Notes and Play Console review notes,
then add current demo credentials before submission.

```text
TailTag is a 13+ convention game where users create profiles, register fursuits, log catches, and track achievements at events.

TailTag includes user-generated profiles, fursuit listings, photos, catch submissions, report text, and support text. It is not a dating, matchmaking, hookup, random chat, adult-content, or monetized UGC service. Adult, sexual, pornographic, grooming, CSAM, CSAE, harassment, bullying, and illegal content or conduct are prohibited by the Terms of Service and Child Safety Standards.

Users must accept TailTag's Terms, Privacy Policy, and Child Safety Standards before creating an account or uploading user-generated content.

Users can report profiles, fursuits, and catch content in-app, and can block other users. Reports go to the admin reports queue. TailTag staff can review reports, record resolution notes, restrict content or features where supported, suspend accounts, and respond to child safety reports through the published support path. During launch week, the reports queue will be reviewed at least daily, with child safety and severe harm reports treated as urgent.

Account deletion is available in-app at Settings -> Profile & account -> Delete account. Users can also request deletion outside the app at https://playtailtag.com/delete-account.

Foreground location is requested only when a user chooses to verify that they are at a convention. TailTag sends the user's current latitude, longitude, and accuracy to the backend for geofence verification and does not continuously track background location.

Camera and photo library access are used so users can add profile, fursuit, and catch photos. Push notifications are used for catch, achievement, daily task, and account/activity notifications.

18+ visibility is a privacy boundary only. It limits profile/fursuit visibility to users who have declared they are 18 or older and does not permit adult or sexual content.

Demo account:
Use docs/store-submission/reviewer-demo-account.md for the current reviewer
account email, seeded demo data, suggested review flow, and credential handling.
Paste the current password from the release credential store before submission.
Suggested review flow: sign in, complete or inspect the profile, open Settings to see legal/account deletion controls, open a fursuit/profile/catch detail to see report/block controls, and use the Catch tab to review catch entry/photo flows.
```

## Pre-Submission Checklist

- Confirm these URLs are publicly reachable without authentication:
  - `https://playtailtag.com/privacy`
  - `https://playtailtag.com/terms`
  - `https://playtailtag.com/delete-account`
  - `https://playtailtag.com/child-safety`
- Add current demo account credentials from
  `docs/store-submission/reviewer-demo-account.md` to the review notes.
- Confirm at least one production staff/admin user can access the reports queue
  and player moderation panel.
- Confirm Finn is still the launch-week moderation owner, or replace the owner in
  `docs/runbooks/moderation-response.md`.
- Re-check SDK/provider guidance for Supabase, Expo, Sentry, Apple, Google, and
  Discord immediately before submission.
- Re-run a code review for new data collection paths, new SDKs, changed Sentry
  settings, changed location behavior, changed push behavior, or changed account
  deletion behavior.
- If Sentry replay, ads, personalization, or cross-app/cross-site tracking are
  added later, update the privacy policy, App Privacy answers, Data safety
  answers, and this package before shipping.
