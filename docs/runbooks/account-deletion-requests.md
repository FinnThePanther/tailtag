# Account Deletion Requests (Support)

Use this runbook for deletion requests received at `support@playtailtag.com` from users who cannot access in-app deletion.

## Scope

- Public request URL: `https://playtailtag.com/delete-account`
- Request channel: `mailto:support@playtailtag.com?subject=TailTag%20Account%20Deletion`
- Fulfillment target: within 30 days after account ownership verification

## Support Workflow

1. Confirm request details:
   - Account email address
   - TailTag username or display name
   - Explicit request to delete account and associated data
2. Verify account ownership before deletion.
3. Execute account deletion through the existing production deletion flow.
4. Confirm the request is complete by checking that the user can no longer authenticate and primary account/profile records are removed.
5. Reply to the requester confirming deletion completion.
6. Record completion timestamp and handler notes in support tracking.

## Notes

- Deletion removes account-linked profile and gameplay data through the existing backend cascade.
- Some records may be retained for safety, audit, legal, or operational reasons, with user references minimized where possible.
