# Build notes

Juniper was built on 2026-11-02 from the Evergreen Digital App Template (commit 3d2379c), which was itself pulled from Grove. The template history is kept, so `git log` shows where the base ends.

## Copy back to the template
These are general and every app should get them:
- Multi-business: `workspaces.slug`, `invites` table and `/join` flow, active workspace cookie and switcher, `PLATFORM_ADMINS` and `/admin` (replaces `APP_TEAM`)
- `audit_log` table and `auditRow()`
- `batch()` helper in `lib/db.ts` (takes a plain list so optional steps can be spread in)
- `lib/action-result.ts` (`toResult`) and `lib/form.ts` (`formObject`)
- `lib/tokens.ts` (hashed secrets for links)
- `Dialog` component and the `useAct` error callback
- `zoned.ts` in core (wall time in a zone, DST safe) and its tests
- Security headers split so one path can be embedded (`frame-ancestors`)

## Testing notes
The full flow was run end to end against a local Postgres on 2026-11-02: admin setup, business creation, invite and join, schedules, online booking with a processing gap, two people booking the same time at once (one wins, the other is told to pick again), manage link reschedule and cancel, staff booking with "Book anyway", clock in and breaks, time off request and approval, timesheet edit and CSV, and the embed on a different site.
