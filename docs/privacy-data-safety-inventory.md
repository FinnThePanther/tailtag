# TailTag Privacy and Data Safety Inventory

Last updated: April 13, 2026

Use this inventory as the source of truth for TailTag's privacy policy, Apple App Privacy labels, and Google Play Data safety answers for the first TestFlight and Google Play testing submission.

## Public Policy Values

- App name: TailTag
- Privacy policy URL: `https://playtailtag.com/privacy`
- Account deletion URL: `https://playtailtag.com/delete-account`
- Support email: `finn@finnthepanther.com`
- Intended audience: users 13 and older; TailTag is not directed to children under 13.
- Ads: no ads.
- Sale of personal information: no sale.
- Cross-app or cross-site advertising tracking: no.
- Encryption in transit: yes, TailTag uses encrypted network connections for app/server communication.
- User deletion mechanism: yes, in-app deletion and public web deletion request page.

## App Data Inventory

| Data area | Data collected | Source | Used for | User control |
| --- | --- | --- | --- | --- |
| Account and sign-in | Email address, TailTag user ID, username/display name, auth provider identifiers, auth metadata | User sign-in, Supabase Auth, Apple/Google/Discord OAuth | Account management, authentication, support, diagnostics identity | Required for account use |
| Profile | Profile avatar, bio, social links, onboarding state, role, account settings | User entry and app settings | App functionality, user profile display, moderation, account management | User can edit or delete account |
| Fursuits | Fursuit names, photos, descriptions, species, colors, catch settings, convention associations | User entry and uploads | App functionality, profile display, gameplay, moderation | User can edit/delete fursuits or delete account |
| Gameplay | Catches, catch status, timestamps, convention participation, achievements, daily tasks, streaks, leaderboards, notifications, NFC tag registrations/scans, gameplay events | User actions and backend processing | App functionality, leaderboards, notifications, anti-abuse, diagnostics | Core app data; removed where linked by deletion flow |
| Photos | Profile avatars, fursuit photos, catch photos | Camera, media picker, user upload | App functionality, profile/fursuit display, catch review, moderation | Optional per upload; removed where stored under account by deletion flow |
| Location verification | Foreground latitude, longitude, location accuracy, verification result, distance to convention geofence, convention ID, timestamp | User-initiated foreground location check | Convention verification, anti-abuse, safety, diagnostics | Optional unless joining a geofence-required convention |
| Push notifications | Expo push token, push permission status, notification preferences, notification records, delivery retry data | Device notification APIs, Expo, backend notification pipeline | App functionality, developer communications, catch/achievement/task notifications | User can disable notifications |
| Diagnostics and telemetry | Crash logs, error logs, performance traces, profiling data, device/app metadata, navigation breadcrumbs, signed-in user ID/email/username context | Sentry SDK and app instrumentation | Diagnostics, analytics, app reliability, support, security | Collected for beta reliability; not used for ads |
| Moderation and safety | Reports, blocks, moderation actions, report descriptions, resolution notes, staff actions | User reports, staff review, admin dashboard | Safety, fraud prevention, compliance, support | Reports may be retained for safety and audit needs |
| Support and deletion requests | Support emails, deletion request details, verification notes, completion timestamps | User contact with support | Support, account deletion, legal/audit tracking | User initiates; limited retention for support records |

## Processors and Providers

| Provider | Role | Data handled |
| --- | --- | --- |
| Supabase | Authentication, database, storage, realtime, Edge Functions | Account, profile, fursuit, gameplay, media paths/files, moderation, notifications, deletion flow |
| Expo | App services and push notification infrastructure | Push tokens, project/device notification data, app service metadata |
| Sentry | Crash reporting, diagnostics, performance monitoring, profiling | Crash/error/performance data, device/app metadata, breadcrumbs, signed-in user context |
| Apple | Sign in with Apple, App Store/TestFlight, platform push services | OAuth identity data when selected by user, platform account/distribution metadata, push delivery data |
| Google | Google OAuth, Google Play, Android platform services | OAuth identity data when selected by user, Play/distribution metadata, platform service data |
| Discord | Discord OAuth and community support channel | OAuth identity data when selected by user; support/community messages if user contacts TailTag through Discord |

For Google Play Data safety, default TailTag service providers to `not shared` when they process data on TailTag's behalf and under TailTag's instructions. User-initiated OAuth with Apple, Google, or Discord should be treated as a user-requested provider action unless current Play Console guidance or provider SDK guidance requires a different answer.

## Apple App Privacy Draft

Overall answers:

- Data collected: yes.
- Tracking: no.
- Third-party partner collection included: yes, include integrated SDKs and providers.
- Data linked to the user: yes for account, profile, gameplay, push, location verification, moderation, and Sentry events with user context.

Recommended Apple data types:

| Apple data type | Collect? | Linked to user? | Purposes |
| --- | --- | --- | --- |
| Contact Info - Email Address | Yes | Yes | App Functionality, Account Management, Customer Support |
| Contact Info - Name | Yes, when provided by auth provider or profile/display name | Yes | App Functionality, Account Management |
| Identifiers - User ID | Yes | Yes | App Functionality, Account Management, Analytics, Developer Communications, App Security |
| Identifiers - Device ID | Yes, through platform/Sentry/Expo diagnostics where applicable | Yes when tied to account/session | App Functionality, Analytics, App Security |
| User Content - Photos or Videos | Yes | Yes | App Functionality, Customer Support, App Security |
| User Content - Gameplay Content | Yes | Yes | App Functionality, Analytics, App Security |
| User Content - Other User Content | Yes | Yes | App Functionality, Customer Support, App Security |
| Location - Precise Location | Yes, for user-initiated convention verification | Yes | App Functionality, App Security |
| Usage Data - Product Interaction | Yes, through gameplay records, app events, and diagnostics | Yes | App Functionality, Analytics, App Security |
| Diagnostics - Crash Data | Yes | Yes when Sentry user context is attached | Analytics, App Functionality |
| Diagnostics - Performance Data | Yes | Yes when Sentry user context is attached | Analytics, App Functionality |
| Diagnostics - Other Diagnostic Data | Yes | Yes when Sentry user context is attached | Analytics, App Functionality, App Security |

Apple notes:

- Do not mark data as used for Third-Party Advertising or Developer's Advertising or Marketing for this beta submission.
- Do not mark tracking as yes unless a later SDK review finds cross-company advertising tracking.
- Location is collected because precise coordinates are transmitted to TailTag backend verification, even though TailTag does not continuously track background location.
- Sentry replay is disabled for production beta builds. If replay is enabled later, update the public policy, this inventory, and store declarations before shipping that build.

## Google Play Data Safety Draft

Data collection and security:

- Does the app collect or share required user data types? Yes.
- Is all collected user data encrypted in transit? Yes.
- Does the app provide a way for users to request data deletion? Yes.
- Is the app committed to follow the Families Policy? No, unless target-audience setup separately requires it; TailTag is not directed to children under 13.
- Independent security review: No, unless a MASA or equivalent review is completed later.

Recommended Google data types:

| Google data type | Collect/share | Required or optional | Purposes |
| --- | --- | --- | --- |
| Location - Precise location | Collected | Optional unless joining a geofence-required convention | App functionality, Fraud prevention/security/compliance |
| Location - Approximate location | Collected if Android coarse location permission remains available | Optional unless joining a geofence-required convention | App functionality, Fraud prevention/security/compliance |
| Personal info - Name | Collected | Optional for profile/display name, may be provided by OAuth | App functionality, Account management |
| Personal info - Email address | Collected | Required for account/auth flows | Account management, App functionality, Developer communications, Fraud prevention/security/compliance |
| Personal info - User IDs | Collected | Required for account use | Account management, App functionality, Analytics, Fraud prevention/security/compliance |
| Photos and videos - Photos | Collected | Optional per upload | App functionality, Fraud prevention/security/compliance |
| App activity - App interactions | Collected | Required for app functionality/diagnostics | App functionality, Analytics, Fraud prevention/security/compliance |
| App activity - Other user-generated content | Collected | Optional for user-entered bios, social links, report text, support details | App functionality, Account management, Fraud prevention/security/compliance |
| App activity - Other actions | Collected | Required for gameplay features | App functionality, Analytics, Fraud prevention/security/compliance |
| App info and performance - Crash logs | Collected | Required for beta diagnostics | Analytics, App functionality |
| App info and performance - Diagnostics | Collected | Required for beta diagnostics | Analytics, App functionality, Fraud prevention/security/compliance |
| App info and performance - Other app performance data | Collected | Required for beta diagnostics | Analytics, App functionality |
| Device or other IDs | Collected | Required for push, auth/session, and diagnostics where applicable | App functionality, Analytics, Fraud prevention/security/compliance, Developer communications |

Google notes:

- Avoid Advertising or marketing and Personalization purposes for this beta submission.
- Mark service-provider processing as not shared by default when the processor acts on TailTag's behalf.
- Review the latest provider SDK guidance for Sentry, Expo, Supabase, Apple, Google, and Discord before final submission. If a provider classifies a transfer as sharing under Google Play's current definitions, update this inventory and the Play Console answers together.
- If Android release permissions still include both `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`, include both precise and approximate location.

## Account Deletion and Retention

Public request paths:

- In app: `Settings -> Profile & account -> Delete account`
- Web: `https://playtailtag.com/delete-account`
- Email: `finn@finnthepanther.com`

Deletion behavior to disclose:

- Deletes the Supabase auth user.
- Removes profile avatars, fursuit photos, and catch photos stored under the deleted user's account folder.
- Cascades account-linked profile and gameplay data, including owned fursuits, catches tied to owned fursuits or created by the account, achievements, daily progress, daily streaks, and notifications linked to the account.
- Nullifies or minimizes some references in shared records when required for service integrity.

Retention language:

- Limited records may be retained for safety, legal compliance, audit history, support tracking, service integrity, or operational backups.
- Retained records should minimize, nullify, or de-identify user references where practical.

## Final Pre-Submission Checks

- Confirm `/privacy` and `/delete-account` are publicly reachable without authentication.
- Confirm privacy policy, delete-account page, App Store Connect, and Play Console all use the same support email and deletion URL.
- Re-run a quick code review before store submission for new data collection paths, new SDKs, changed Sentry settings, changed location behavior, changed push behavior, or changed account deletion behavior.
- Update this inventory before updating store forms if TailTag changes data collection, processors, tracking posture, target audience, or deletion behavior.
