# TailTag Store Metadata Draft

Last updated: June 6, 2026

Use this draft when filling the App Store Connect and Play Console main store
listing fields for the first full TailTag app-store release. Keep this document
aligned with `docs/store-submission/compliance-package.md`, public policy pages,
screenshots, and the reviewer demo account.

Primary references:

- Apple App Information:
  https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- Apple Platform Version Information:
  https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- Google Play create and set up your app:
  https://support.google.com/googleplay/android-developer/answer/9859152
- Google Play store listing best practices:
  https://support.google.com/googleplay/android-developer/answer/13393723

## Positioning

TailTag is a convention game for creating a profile, registering fursuits,
logging catches, and tracking achievements at events. The store listing should
make the game loop obvious without positioning TailTag as dating, matchmaking,
random chat, adult content, or a general-purpose social network.

Recommended messaging:

- Primary product category: convention game.
- Primary user value: register fursuits, log catches, collect achievements, and
  follow event leaderboards.
- Social posture: users see profiles, fursuits, photos, catches, and
  leaderboards as part of gameplay.
- Safety posture: UGC is subject to terms, child safety standards,
  report/block controls, and moderation.
- Do not claim awards, rankings, install counts, store performance, discounts,
  or time-sensitive launch language.

## Shared Public Values

| Field | Value |
| --- | --- |
| App name | TailTag |
| Primary language | English (United States) |
| Website / marketing URL | `https://playtailtag.com` |
| Privacy Policy URL | `https://playtailtag.com/privacy` |
| Account deletion URL | `https://playtailtag.com/delete-account` |
| Child Safety Standards URL | `https://playtailtag.com/child-safety` |
| Support email | `finn@finnthepanther.com` |
| Ads | No ads |
| Paid app / in-app purchases | None for initial release |
| Target audience | 13+; TailTag is not directed to children under 13 |

## App Store Connect Draft

### App Information

| Field | Draft value | Notes |
| --- | --- | --- |
| Name | `TailTag` | Apple limit: 2-30 characters. |
| Subtitle | `Convention fursuit catch game` | 29 characters; Apple limit: 30 characters. |
| Primary language | English (U.S.) | Use the existing English policy pages and screenshots. |
| Bundle ID | `com.finnthepanther.tailtag` | Must match the production iOS bundle. |
| SKU | `tailtag-ios` | Internal only; confirm if an existing SKU already exists in App Store Connect. |
| Primary category | Games | TailTag's primary behavior is gameplay. |
| Game subcategory 1 | Casual | Best fit for lightweight convention play. |
| Game subcategory 2 | Not selected | Avoid forcing a weak second subcategory unless App Store Connect requires one. |
| Secondary category | Social Networking | Optional; use only if App Store Connect accepts the social/profile surface as secondary. |
| Content rights | No, does not contain third-party copyrighted content requiring additional rights | Re-check screenshots and demo content before submission. |
| Made for Kids | No | TailTag is 13+ and not directed to children under 13. |
| License agreement | Apple's standard EULA | No custom EULA planned for initial release. |

### App Privacy

Use `docs/store-submission/compliance-package.md` for the full App Privacy
questionnaire.

| Field | Draft value |
| --- | --- |
| Privacy Policy URL | `https://playtailtag.com/privacy` |
| User Privacy Choices URL | `https://playtailtag.com/delete-account` |

### Version Information

| Field | Draft value | Notes |
| --- | --- | --- |
| Promotional text | `Turn real convention moments into catches, achievements, and friendly leaderboard progress.` | 91 characters; Apple limit: 170 characters. |
| Description | Use the paste-ready App Store description below. | Apple limit: 4000 characters. |
| Keywords | `fursuit,furry,convention,catch,game,achievements,leaderboard,photos,meetups,events` | 81 bytes; Apple limit: 100 bytes. Do not duplicate `TailTag` or developer name. |
| Support URL | `https://playtailtag.com/privacy` | Current public page includes contact email. Prefer replacing with `https://playtailtag.com/support` if a dedicated support page is added before submission. |
| Marketing URL | `https://playtailtag.com` | Optional but recommended. |
| Version release setting | Manual release after approval | Recommended for first full release so approval and public launch can be coordinated. |
| Copyright | `2026 [LEGAL OWNER]` | Replace with the legal owner shown in App Store Connect before submission. |

### Paste-Ready App Store Description

```text
TailTag is a convention game for fursuiters and friends. Create a profile, register your fursuit, log catches when you meet other players, and track your progress through achievements and event leaderboards.

Create your convention profile
Set up your TailTag profile, add your fursuit details, and choose how your profile appears to other players at events.

Log catches at events
Use the in-app catch flow to record the fursuiters you meet. TailTag supports catch photos, catch codes, and convention-specific catch history.

Track progress
Follow your catches, complete daily tasks, earn achievements, and see how your convention activity changes over time.

Play around conventions
TailTag can use foreground location only when you choose to verify that you are at a convention. The app does not continuously track background location.

Safety and account controls
TailTag includes user-generated profiles, fursuit listings, photos, and catch content. Users can report content, block other users, and delete their account in the app. Adult, sexual, dating, matchmaking, hookup, grooming, CSAM, CSAE, harassment, bullying, and illegal content or conduct are not allowed.

TailTag is intended for users 13 and older.
```

### App Store Review Information

Use the paste-ready review notes in
`docs/store-submission/compliance-package.md`, then add the current reviewer demo
account credentials from `docs/store-submission/reviewer-demo-account.md` before
submission.

Recommended contact values:

| Field | Draft value |
| --- | --- |
| First name | Finn |
| Last name | [CONFIRM LAST NAME OR ACCOUNT CONTACT NAME] |
| Phone number | [CONFIRM APP REVIEW PHONE] |
| Email | `finn@finnthepanther.com` |

## Google Play Draft

### App Details

| Field | Draft value | Notes |
| --- | --- | --- |
| App name | `TailTag` | Google Play limit: 30 characters. |
| Short description | `Catch fursuits, collect achievements, and play with friends at conventions.` | 72 characters; Google Play limit: 80 characters. |
| Full description | Use the paste-ready Google Play full description below. | Google Play limit: 4000 characters. |
| App type | Game | TailTag's primary user experience is gameplay. |
| Category | Casual | Best fit for lightweight event-based gameplay. |
| Tags | `Casual`, `Social`, `Simulation` | Confirm available Play Console tags; select only tags that appear in the console. |
| Website | `https://playtailtag.com` | Recommended support website. |
| Contact email | `finn@finnthepanther.com` | Required by Google Play. |
| Contact phone | [OPTIONAL - CONFIRM IF PUBLISHING] | Optional. |
| Privacy Policy URL | `https://playtailtag.com/privacy` | Required because TailTag collects user data. |
| Account deletion URL | `https://playtailtag.com/delete-account` | Required for apps with account creation. |

### Paste-Ready Google Play Full Description

```text
TailTag is a convention game for fursuiters and friends. Create a profile, register your fursuit, log catches when you meet other players, and track your progress through achievements and event leaderboards.

What you can do in TailTag:

- Create a TailTag profile for convention play
- Register fursuits with photos and details
- Log catches when you meet other players at events
- Add catch photos where supported by the catch flow
- Log catches with photos or catch codes
- Complete daily tasks and earn achievements
- Follow convention leaderboards and catch history
- Report content, block users, and manage account settings

TailTag is built for real-world convention gameplay. Foreground location is used only when you choose to verify that you are at a convention. TailTag does not continuously track background location.

TailTag includes user-generated profiles, fursuit listings, photos, catch submissions, report text, and support text. Users must follow TailTag's Terms, Privacy Policy, and Child Safety Standards. Adult, sexual, dating, matchmaking, hookup, grooming, CSAM, CSAE, harassment, bullying, and illegal content or conduct are not allowed.

TailTag is intended for users 13 and older.
```

### Store Settings

| Field | Draft value | Notes |
| --- | --- | --- |
| App category | Games / Casual | Keep consistent with app details. |
| External marketing | Enabled by default unless Finn wants to restrict promotion across Google-owned properties. | Google Play may use listing assets for promotional surfaces. |
| Target audience | 13+ | Do not include children under 13 unless product/legal posture changes. |
| Ads declaration | No ads | Keep aligned with compliance package. |
| App access | Login required | Use reviewer demo credentials from `docs/store-submission/reviewer-demo-account.md` before submission. |
| Data Safety | Use `docs/store-submission/compliance-package.md` | Do not duplicate answers here. |

## Screenshot Copy Direction

Use screenshot captions only if they are part of the captured app UI or are
needed to clarify the feature. Keep added text minimal and avoid claims that
could become stale.

Recommended screenshot sequence:

1. Home / convention overview: show the active convention context and progress.
2. Catch flow: show catch entry, photo, or catch code entry.
3. Fursuit profile: show registered fursuit details and convention roster value.
4. Achievements / daily tasks: show progress and repeat gameplay.
5. Leaderboard or caught collection: show event progress.
6. Settings / safety controls: show legal, report/block, or account deletion
   access if needed for reviewer clarity.

Screenshot safety checklist:

- Use only production-safe demo accounts and demo content.
- Do not show staging/dev environment banners.
- Do not show private user data, real support requests, or real moderation
  details.
- Do not show adult, dating, hookup, sexual, CSAM, CSAE, harassment, bullying,
  or policy-violating content.
- Do not show beta/prerelease copy in store screenshots.
- Do not include store badges, price claims, rankings, awards, or install-count
  claims in screenshot overlays.
- Keep status bars clean: no unexpected notifications, low battery, or carrier
  artifacts.

## Open Decisions Before Submission

- Confirm whether iOS `supportsTablet: true` remains intentional. If yes, capture
  and QA iPad screenshots. If no, update native config before submission and
  handle the resulting native release requirements.
- Confirm the legal copyright owner for App Store Connect.
- Confirm whether to add a dedicated `https://playtailtag.com/support` page. This
  would be cleaner than using the privacy page as the App Store Support URL.
- Confirm final App Store Review contact phone number.
- Confirm final Play Console contact phone number, or leave it blank if Finn does
  not want a phone number published.
- Confirm reviewer demo account credentials in
  `docs/store-submission/reviewer-demo-account.md` and add them to the review
  notes before submission.
