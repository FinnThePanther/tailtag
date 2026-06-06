# TailTag Reviewer Demo Account

Last updated: June 6, 2026

Use this package when filling App Store Connect App Review Information, Play
Console App access instructions, and internal release smoke-test notes. Keep the
password out of git; paste it from the release credential store when submitting.

## Reviewer Account

| Field | Value |
| --- | --- |
| Purpose | Store reviewer login and demo gameplay validation |
| Email | `reviewer-134@playtailtag.com` |
| Password | Add from the release credential store before submission. Do not commit it. |
| Username | `reviewer134` |
| Environment status | Seeded and verified in staging on June 6, 2026 |
| Production status | Create or verify the same account in production before final store submission |

Recommended credential-store entry:

```text
TailTag store reviewer account
Email: reviewer-134@playtailtag.com
Password: [current password]
Notes: Used for App Store Connect and Play Console app access review.
```

## Seeded Demo Data

The staging reviewer account has production-safe demo data for screenshots and
store review:

| Data | Value |
| --- | --- |
| Demo convention | `TailTag Demo Con` |
| Reviewer fursuit | `Comet` |
| Reviewer fursuit catch code | `COMET42` |
| Friend/demo fursuit | `Maple` |
| Friend/demo fursuit catch code | `MAPLE24` |
| Existing reviewer catch count | 1 seeded catch |
| Profile bio | `Convention fursuiter, tag collector, and TailTag demo player.` |
| Reviewer fursuit ask-me-about text | `conventions, badge ribbons, NFC tags` |

Do not seed real user data, real support requests, adult content, private
moderation details, or non-demo convention data into the reviewer account.

## Suggested Reviewer Flow

Paste this flow into review notes after adding the current password:

```text
Sign in with the demo account. The account has a completed profile, one demo fursuit, one seeded catch, and an active demo convention.

Suggested flow:
1. Open Home to see the convention game loop, daily tasks, achievements, and catch actions.
2. Open Caught to inspect an existing demo catch.
3. Open Catch and enter MAPLE24 to exercise the catch-code flow for a demo fursuit.
4. Open My Suits to inspect the reviewer fursuit, Comet, and catch code COMET42.
5. Open Settings to inspect profile/account controls, legal links, blocked users, and account deletion access. Please do not complete account deletion during review.
6. From profile, fursuit, or catch detail surfaces, use the overflow/action menu to inspect report and block controls.
```

## Pre-Submission Checks

- Confirm the reviewer password is current and stored outside git.
- Confirm the same account and demo data exist in the environment submitted to
  App Store Connect and Play Console.
- Confirm the account can sign in without onboarding, age-gate, legal-consent, or
  empty-state blockers.
- Confirm the reviewer account has no real/private user data.
- Confirm `MAPLE24` can be used for a fresh catch in the submitted environment.
- Confirm `COMET42` is visible on the reviewer fursuit and can be referenced in
  review notes.
- Confirm Settings still exposes account deletion without requiring admin help.
- Confirm report/block controls are visible on profile, fursuit, and catch
  detail surfaces.
