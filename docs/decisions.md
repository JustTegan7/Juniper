# Juniper One: Decisions

Every architecture decision, with the reason. Claude reads this before changing structure. Newest at the bottom of each section. The first sections came with the Evergreen Digital App Template; Juniper One decisions start at "Juniper One v1".

## Origin (2026-11-02)

- **This template is Grove stripped down.** Grove (thegrovecms.com) is the first app on this stack and is live. Everything every app needs (logins, workspace, roles, app shell, marketing shell, database setup, CI) stays. Everything CRM specific was removed. See `docs/BUILD-NOTES.md`.
- **Two Evergreen templates.** The Evergreen Digital Website Template is for static client sites with no database. This one is for apps with logins and a database. Evergreen Canopy (the shared suite core) and Juniper One are the first apps built from it.

## Stack (from Grove, 2026-10-06)

- **Next.js 16 + TypeScript + Tailwind v4, Neon Postgres + Drizzle, Better Auth, Vercel hosting.** Free tiers cover building and pilots. Better Auth runs inside our app so logins are not tied to a database vendor.
- **Tenant isolation lives in the service layer.** Every query is scoped to `ctx.workspace.id` inside a service function. There is no Supabase style row level security. If an app needs a second layer (payroll records, for example), add Postgres RLS policies keyed on a per-transaction setting, and record that decision here.

## Built for the phone app from day one (from Grove, 2026-10-06)

1. **Monorepo with npm workspaces.**
   - `apps/web`: the Next.js app (marketing site at `/` plus the signed-in app).
   - `apps/mobile`: the phone app, added later. Empty placeholder for now.
   - `packages/core`: domain types, zod helpers, date helpers. Plain TypeScript, no Next.js or React imports, so the phone app can use the exact same rules.
   - `packages/db`: Drizzle schema, migrations and client.
   - `packages/brand`: color, radius and font tokens as a TypeScript object. Web CSS and the phone app both read from it.
2. **Phone app will be Expo (React Native), not a web wrapper.** Reasons: camera, push notifications, working on bad signal, native feel, and Apple can reject apps that are only a website in a shell. Better Auth supports Expo, and Expo can use `packages/core` and `packages/brand` directly.
3. **Business logic lives in services, not in server actions.** Every read and write is a plain function in `apps/web/lib/services` that takes `(ctx, input)`, where ctx is the signed-in user, workspace and role. Server actions are thin wrappers. Later, `/api/v1` route handlers wrap the same functions for the phone app.
4. **IDs are UUIDv7, generated in our code.** Lets the phone create records offline and sync later without ID clashes, and keeps records sortable by creation time.
5. **Every synced table has `updated_at` and `deleted_at`.** Deletes are soft. The phone app syncs "everything changed since my last sync" and needs to learn about deletes too.
6. **Time zones are stored, not assumed.** Workspaces have a `timezone` (default `America/Los_Angeles`), users can override it. "Today" is worked out in the workspace or user time zone and passed into core, never read from the server clock inside it.
7. **URLs are stable and shareable** so the phone app can open the same links (universal links).
8. **Reserved identifiers** (bundle ID, URL scheme, app name) are set per app in `apps/mobile/README.md`.
9. **Files from the phone** upload straight to Vercel Blob with short-lived upload tokens issued by a guarded route, so large photos never pass through our server.

## Base behavior (from Grove Lite, 2026-10-30)

- **One workspace for now.** Our own `workspaces` and `memberships` tables instead of Better Auth's organization plugin. Multi-business sign-up comes with the first app that needs it (Juniper One).
- **Sign-up is limited to an allowlist** (`APP_TEAM` env var, `email:role` pairs) checked on the server in a Better Auth hook. People create their own password and land in the workspace with the right role.
- **Roles in the base are owner, manager, member.** Apps can add their own roles (stylist, front desk) on top.
- **Migrations run on every Vercel deploy** (`vercel-build` script). No one runs them by hand against production.
- **Writes that must land together use Neon batches** (one transaction per batch over HTTP).
- **Password reset**: Better Auth reset flow with a one hour, single use link that signs the person out everywhere. Emails go through Resend's HTTP API when `RESEND_API_KEY` and `EMAIL_FROM` are set; until then the request does nothing and the page says to ask an owner. The forgot form gives the same answer for any email so accounts cannot be probed.
- **Owner fallback**: owners can set a temporary password for a teammate on the Team page. Works without email.

## Patterns kept in Grove, ready to copy back (2026-11-02)

- **Files**: private Vercel Blob store, paths under `ws/<workspace>/...`, every view and download goes through a route that checks the member's workspace, 4 MB server uploads, allowed types in `@evergreen/core` files.ts.
- **Undo on toasts**: the service records what it changed, signs it with HMAC, and the browser holds only the token. The Toast component already supports an action button.
- **Command palette**: Ctrl or Cmd K, ARIA combobox, uses the fuzzy matcher in `@evergreen/core` search.ts.

## Juniper One v1 (2026-11-02)

- **Standalone app, no shared core yet.** Grove and Juniper have different clients, so each is built from the app template on its own. Canopy (the shared core) comes when clients use more than one app.
- **One app, many businesses.** One deployment and database. Each business is a workspace with a unique `slug` for its public booking link. People can belong to several businesses; the active one is a cookie (`jo_ws`) checked against their memberships on every request. This keeps working if a client buys their website out, because booking lives here, not in the website.
- **Who can sign up.** Staff join only through an invite link (`/join?token=`). The invite secret is stored hashed, works for 14 days, is tied to one email, and is checked inside the Better Auth create-user hook through a request header, so the public sign-up endpoint cannot be used without it. Evergreen staff in `PLATFORM_ADMINS` can create a login directly and manage businesses at `/admin`; they see a business's data only after adding themselves ("Open for support", recorded as a membership).
- **Clients sign in with magic links** (Better Auth plugin, 15 minutes, hashed). A link is only emailed when that email is already a client of the business in the link, so the form cannot be used to email strangers. A client account sees only appointments whose client email matches its verified email. Guests do not need an account: every confirmation has a manage link.
- **Roles stay owner, manager, member.** Job titles (Stylist, Front desk) are data. Managers run the whole calendar, approve time off, edit timesheets and settings. Members see the calendar, book and change appointments on their own column, clock in and out, and request time off. Only owners change roles, time clock rules and temporary passwords.
- **Industry presets.** A business picks an industry (salon, barber, spa, nails, fitness, wellness, pet, general). The preset sets the words (Stylist, Client) and an optional starter menu. Everything is editable afterwards, so non-salon businesses need no code changes.
- **Settings are one JSON column** parsed by `workspaceSettingsSchema` in core, with defaults, so new settings never need a migration and old rows keep working.
- **Services are split into active before, processing, active after and cleanup.** The staff member is busy only in the active parts and cleanup. Per-person price and timing overrides live in `staff_services`. A service with nobody assigned can be done by every bookable person.
- **Appointments copy the service name, timing and price** when booked, so editing the menu never rewrites history. One service per appointment; `visit_id` is reserved for multi-service visits.
- **Busy time is stored as segments with a Postgres exclusion constraint** (`btree_gist`, `EXCLUDE USING gist (membership_id WITH =, tstzrange WITH &&) WHERE NOT allow_overlap`). Availability is computed in code, but the database is the final word, which closes the race between two clients booking the same slot. Staff "Book anyway" writes segments with `allow_overlap` so it never blocks, and online availability still treats that time as busy. Cancelled and no-show appointments delete their segments.
- **Online availability** = staff weekly hours (or that day's change) inside business hours, minus busy segments and approved time off, at the business's start-time step, after the lead time, within the booking window. "Any available" picks the free person with the fewest booked minutes that day and never reveals who is free. Staff booking from the calendar ignores business hours and lead time but warns.
- **Time zones are explicit.** Every conversion uses the business time zone with a dependency-free `zonedToUtc` / `utcToZoned` in core that handles daylight saving gaps and repeats (tested).
- **Time clock follows Washington rules by default** and every number is a setting: overtime after 40 hours in a fixed workweek, a 30 minute unpaid meal for shifts over 5 hours starting by the 5th hour, paid rest breaks. Overtime lands on the day the week crosses 40 hours, so pay periods that split a workweek (twice a month) are still right. Flags help managers review; the UI says they are not legal advice. One open shift and one open break per person are enforced by partial unique indexes.
- **Manager edits to shifts are logged** in `audit_log` with before and after values; the shift shows as edited.
- **Email only in v1** (Resend over HTTP). Without it, invite links are shown on screen to copy, and confirmations are skipped. Reminders go out from a daily Vercel cron for appointments the next day in each business's time zone; sent ones are marked so the job can run again safely. SMS plugs into `lib/notify.ts` later.
- **Embedding.** `/embed/<slug>` is the only path that may be framed (`frame-ancestors *`); everything else sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`. `/embed.js` mounts the iframe and resizes it from `postMessage` messages, checking the origin.
- **Abuse limits on public booking**: hidden honeypot field, at most 4 online bookings per email per business per day, Better Auth rate limits on auth routes.
- **Deleting a business (2026-11-03).** Platform admins can permanently delete a business from `/admin`. The check runs in the server action and again inside `deleteBusiness` in `lib/services/admin.ts`. The admin types the business's link name, and if it has appointments or time entries they also tick a box; the server re-checks both, so the UI is not the guard. It is a hard delete in one batch: appointments first (they point at clients and staff with RESTRICT), then the `workspaces` row, which cascades to every table keyed by `workspace_id`. Hard rather than soft, because the slug unique index covers soft deleted rows and the link name must be reusable. Login accounts are kept (one person can belong to several businesses). The business's own `audit_log` rows cascade away with it, so the record of the delete is a structured `business_deleted` log line, not an audit row. Tests run the real migrations on PGlite (in-process Postgres) so cascades and constraints are the real ones.

## Not decided yet

- Offline sync engine for the phone (build simple "changes since" sync first).
- Push provider details (Expo push service is the default plan).
- Per-business custom domains.
- Payments provider for deposits, storefront and POS.
