# TailTag Reviewer Demo Account

Last updated: June 7, 2026

Use this package when filling App Store Connect App Review Information, Play
Console App access instructions, and internal release smoke-test notes. Keep the
password out of git; paste it from the release credential store when submitting.

## Reviewer Accounts

| Purpose | Email | Username | Password |
| --- | --- |
| Primary store reviewer login | `reviewer-134@playtailtag.com` | `reviewer134` | Add from the release credential store before submission. Do not commit it. |
| Auto-accept companion account | `reviewer-auto-134@playtailtag.com` | `reviewerauto134` | Add from the release credential store only if a human tester needs multi-account coverage. |
| Manual-approval companion account | `reviewer-manual-134@playtailtag.com` | `reviewman134` | Add from the release credential store only if a human tester needs pending-approval coverage. |

Environment status:

- Staging: primary reviewer account seeded and verified on June 6, 2026.
- Production: all three reviewer accounts seeded and verified on June 7, 2026.
- Keep passwords out of git. Store them in the release credential store and paste
  only the primary reviewer credentials into App Store Connect / Play Console
  unless review notes need the companion accounts.

Recommended credential-store entry:

```text
TailTag store reviewer accounts
Primary:
- Email: reviewer-134@playtailtag.com
- Username: reviewer134
- Password: [current primary password]

Auto-accept companion:
- Email: reviewer-auto-134@playtailtag.com
- Username: reviewerauto134
- Password: [current auto companion password]

Manual-approval companion:
- Email: reviewer-manual-134@playtailtag.com
- Username: reviewman134
- Password: [current manual companion password]

Notes: Used for App Store Connect, Play Console, and internal release testing.
```

## Seeded Demo Data

The reviewer accounts have production-safe demo data for screenshots, store
review, and internal release smoke testing:

| Data | Value |
| --- | --- |
| Demo convention | `TailTag Demo Con` |
| Reviewer fursuit | `Comet` |
| Reviewer fursuit catch code | `COMET42` |
| Auto-accept companion fursuit | `Maple` |
| Auto-accept companion catch code | `MAPLE24` |
| Manual-approval companion fursuit | `Nova` |
| Manual-approval companion catch code | `NOVA37` |
| Existing primary reviewer catches | 1 accepted catch for `Maple`, 1 pending catch for `Nova` |
| Existing companion catch | `reviewerauto134` has an accepted catch for `Comet` |
| Profile state | Onboarding complete, adult attestation complete, legal acceptance complete |
| Convention state | All accounts actively joined to `TailTag Demo Con`; location verification disabled |

Do not seed real user data, real support requests, adult content, private
moderation details, or non-demo convention data into the reviewer account.

## Store Reviewer Instructions

Paste this flow into review notes after adding the current primary reviewer
password:

```text
Sign in with the primary demo account. The account has a completed profile, one demo fursuit, accepted and pending demo catches, and an active demo convention.

Suggested flow:
1. Open Home to see the active TailTag Demo Con game loop, daily tasks, achievements, and catch actions.
2. Open Caught to inspect the accepted Maple catch and the pending Nova catch.
3. Open Catch and enter MAPLE24 to exercise a normal catch-code flow for an auto-accept demo fursuit.
4. Open Catch and enter NOVA37 to exercise a manual-approval catch-code flow. This may show pending approval if the account has not already caught Nova.
5. Open My Suits to inspect the reviewer fursuit, Comet, and catch code COMET42.
6. Open Settings to inspect profile/account controls, legal links, blocked users, and account deletion access. Please do not complete account deletion during review.
7. From profile, fursuit, or catch detail surfaces, use the overflow/action menu to inspect report and block controls.
```

## Internal Tester Flow

Use this flow for release smoke testing before submission:

1. Sign in as `reviewer134`.
2. Confirm onboarding does not appear and Home opens into `TailTag Demo Con`.
3. Confirm My Suits shows `Comet` with code `COMET42`.
4. Confirm Caught shows `Maple` as accepted and `Nova` as pending.
5. Use the Catch flow with `MAPLE24`; expect either a successful catch or an
   already-caught message if the seed catch is still present.
6. Use the Catch flow with `NOVA37`; expect pending approval or an already-caught
   message depending on prior tester activity.
7. Sign out and sign in as `reviewerauto134`.
8. Confirm this account owns `Maple` and has an accepted catch for `Comet`.
9. Sign out and sign in as `reviewman134`.
10. Confirm this account owns `Nova` and can see pending approval surfaces for
    catches against Nova.
11. Do not delete any reviewer accounts, demo fursuits, or `TailTag Demo Con`.
12. If a tester changes reviewer data, rerun the production reviewer seed before
    app-store submission.

## Pre-Submission Checks

- Confirm the reviewer password is current and stored outside git.
- Confirm the same accounts and demo data exist in the environment submitted to
  App Store Connect and Play Console. Production was last verified on June 7,
  2026.
- Confirm the account can sign in without onboarding, age-gate, legal-consent, or
  empty-state blockers.
- Confirm the reviewer accounts have no real/private user data.
- Confirm `MAPLE24` and `NOVA37` can be used in the submitted environment.
- Confirm `COMET42` is visible on the reviewer fursuit and can be referenced in
  review notes.
- Confirm Settings still exposes account deletion without requiring admin help.
- Confirm report/block controls are visible on profile, fursuit, and catch
  detail surfaces.
