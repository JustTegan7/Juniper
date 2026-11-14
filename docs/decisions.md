# Juniper: Decisions

Every architecture decision, with the reason. Claude reads this before changing structure. Newest at the bottom of each section. The first sections came with the Evergreen Digital App Template; Juniper decisions start at "Juniper v1".

## Origin (2026-11-02)

- **This template is Grove stripped down.** Grove (thegrovecms.com) is the first app on this stack and is live. Everything every app needs (logins, workspace, roles, app shell, marketing shell, database setup, CI) stays. Everything CRM specific was removed. See `docs/BUILD-NOTES.md`.
- **Two Evergreen templates.** The Evergreen Digital Website Template is for static client sites with no database. This one is for apps with logins and a database. Evergreen Canopy (the shared suite core) and Juniper are the first apps built from it.

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

- **One workspace for now.** Our own `workspaces` and `memberships` tables instead of Better Auth's organization plugin. Multi-business sign-up comes with the first app that needs it (Juniper).
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

## Juniper v1 (2026-11-02)

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
- **Embedding.** `/embed/<slug>` is the only path that may be framed (`frame-ancestors *`); everything else sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`. `/embed.js` mounts the iframe and resizes it from `postMessage` messages, checking the origin. An optional `data-theme="light|dark"` on the mount div is passed as `?theme=` and sets `data-theme` on the embed's root element (the CSS already honors it, and `light` overrides the dark media query); anything else is ignored and the form follows the device.
- **Abuse limits on public booking**: hidden honeypot field, at most 4 online bookings per email per business per day, Better Auth rate limits on auth routes.
- **Deleting a business (2026-11-03).** Platform admins can permanently delete a business from `/admin`. The check runs in the server action and again inside `deleteBusiness` in `lib/services/admin.ts`. The admin types the business's link name, and if it has appointments or time entries they also tick a box; the server re-checks both, so the UI is not the guard. It is a hard delete in one batch: appointments first (they point at clients and staff with RESTRICT), then the `workspaces` row, which cascades to every table keyed by `workspace_id`. Hard rather than soft, because the slug unique index covers soft deleted rows and the link name must be reusable. Login accounts are kept (one person can belong to several businesses). The business's own `audit_log` rows cascade away with it, so the record of the delete is a structured `business_deleted` log line, not an audit row. Tests run the real migrations on PGlite (in-process Postgres) so cascades and constraints are the real ones.
- **Deleting a client (2026-11-04).** Owners and managers can permanently delete a client from the client page (button on the profile and inside Edit). The role is checked in `deleteClientAction` and again in `deleteClient` (`lib/services/clients.ts`). The confirmation lists past, upcoming and cancelled appointments that go with the client; if any are upcoming and not cancelled, a checkbox is required and the service re-checks it (`acknowledgeUpcoming`). Hard delete in one batch, every statement filtered by `workspace_id`: appointments first (RESTRICT key; their segments cascade), then the client, plus a kept `audit_log` row and a `client_deleted` log line. Appointments are the only table that references clients. Notes live on the client row, the reminder flag on the appointment row, and the magic link login is a nullable pointer from the client to a shared `user`, which is left alone. Archive (`archiveClient`) still exists and keeps history.

## Brand overhaul (2026-11-03)

- **Name is Juniper.** The product is "Juniper", not "Juniper One". The domain is juniperbooking.com. The phone app id is `com.evergreendigital.juniper` and the URL scheme is `juniper`.
- **Palette.** Juniper Deep (#1F3D36) is the primary. Sage Needle (#6F8F7F), Berry (#4F5D95) and Frost (#C9D2EA) support it, on a Cream (#F7F4EE) page. Clay is a highlight only, never a button background with white text. Dark mode stays, with matching dark tokens in `packages/brand`.
- **Type.** Fraunces for headings and the wordmark, DM Sans for everything else.
- **Logo.** A J with a leaf on top and a berry in the curve. The `Mark` component colors itself from `--logo-stem`, `--logo-leaf` and `--logo-berry`, so it follows light and dark. Static files live in `apps/web/public/brand`.
- **Status colors.** Confirmed, pending and cancelled have their own tokens, so booking and shift states do not borrow brand colors.
- **Per-business color.** Each business keeps its own `brand_color` on its booking pages, with the footer "Powered by Juniper". The database default for new businesses is still the old berry; changing it needs a migration.

## Juniper v2, Sprint 1: API layer and mobile login (2026-11-04)

- **The phone app is for owners and staff only.** No client booking in the app. Clients book through the website, the booking page or the embed. The API has no public or client endpoints.
- **`/api/v1` route handlers are thin wrappers over `lib/services`.** Each handler resolves ctx, calls one service and shapes JSON. No business rules in routes. Shared plumbing is `lib/api.ts` (`apiCtx`, `jsonBody`, `respond`, error mapping, `mePayload`, `clockPayload`).
- **One ctx resolver for web and phone.** `ctxForUser(user, wanted, { strict })` in `lib/services/ctx.ts` is the only code that picks the active business. The web passes the `jo_ws` cookie and falls back to the first business when it is stale (unchanged behavior). The API passes the `x-juniper-workspace` header with `strict: true`, so asking for a business you are not on is a 403, never a silent fallback. No header means the first business, same as the web.
- **Switching business on the phone is stateless.** `POST /api/v1/me/workspace` checks the membership and returns `me` for that business; the phone keeps the id and sends it in the header. No server state, no cookie.
- **Mobile login uses Better Auth's `expo()` plus `bearer({ requireSignature: true })`.** Staff sign in with the same email and password endpoint (`/api/auth/sign-in/email`). The response carries the signed session token in `set-auth-token`; the phone stores it in SecureStore (through `expoClient` from `@better-auth/expo/client`) and sends `Authorization: Bearer <token>` to `/api/v1`. Only signed tokens are accepted. Sessions, expiry and sign-out are the normal Better Auth sessions, so signing out or a password reset ends the phone session too. Web cookies are unchanged.
- **`juniper://` is a trusted origin.** Dev builds (`exp://...`) go in `EXTRA_TRUSTED_ORIGINS`, never in code.
- **`/api/v1/` skips the cookie gate in `proxy.ts`.** The phone sends a bearer token, not a cookie. Every handler checks the real session through `apiCtx`, so nothing is open.
- **Errors are JSON with real status codes.** Success is `{ data }`; failure is `{ error: { code, message } }`. 401 `unauthorized`, 403 `no_workspace` or `forbidden` (`ForbiddenError`), 404 `not_found` (new `NotFoundError`, same message the web shows), 409 `conflict`, 400 `invalid` (zod errors and the plain `Error` messages services already throw for people), 415 for writes that are not JSON, 500 `server_error` with a generic message for anything else (database and driver errors are never echoed). All responses are `Cache-Control: no-store`.
- **Writes require `Content-Type: application/json`.** A browser cannot send that cross-site without a CORS preflight, which the API does not answer, so session cookies cannot be used for cross-site writes.
- **`NotFoundError` replaces plain `Error` for "not found" in appointments and time off.** Same message, so the web is unchanged; the API can answer 404 for another business's records instead of 400.
- **Today's appointments use `loadCalendarDay` for `ctx.today`** in the business time zone. `?scope=mine` (default) is the person's own column; `?scope=all` is the whole calendar, which members can already see on the web.
- **Tests run the route handlers against PGlite with the real migrations** and a fake session (`Bearer <user id>`), covering auth failures, wrong business access and owner, manager and member rules. A separate test checks the real auth config has the phone plugins.

## Juniper v2, Sprint 2: Expo app shell (2026-11-04)

- **Expo SDK 58 with Expo Router, in `apps/mobile` as the npm workspace `@evergreen/mobile`.** App name Juniper, scheme `juniper`, bundle ID and Android package `com.evergreendigital.juniper`. `app.config.ts` (not `app.json`) so the API address can come from the environment.
- **The web build is untouched.** Root `build` and `lint` still run only `@evergreen/web`; `typecheck` and `test` also run the mobile workspace. Vercel keeps Root Directory `apps/web`. npm nests React 19.3 and React Native under `apps/mobile/node_modules`, so web keeps React 19.2.4 and the two never share a copy.
- **The API address is `EXPO_PUBLIC_API_URL`, never hardcoded.** `lib/config.ts` also reads `extra.apiUrl` from the Expo config. With neither set, the app shows an error screen that says what to set instead of calling a wrong server.
- **Auth uses `expoClient` plus the bearer token.** `createAuthClient` from `better-auth/react` with `expoClient` (scheme `juniper`, storage prefix `juniper`, `expo-secure-store`). The `set-auth-token` header from `signIn.email` is saved in SecureStore (`juniper_bearer_token`) and sent as `Authorization: Bearer` by both the auth client and the API client. `better-auth` and `@better-auth/expo` use the same `^1.7.14` range as the web.
- **Sign out clears everything on the phone.** It calls `signOut` (best effort when offline), then deletes the token and the saved business id, so the next person never inherits a business.
- **`lib/api.ts` is plain TypeScript with injected dependencies** (base URL, token, business id, `onUnauthorized`, `fetch`). That keeps it unit testable with no phone. Every write sends `Content-Type: application/json` with a JSON body, even an empty one, because the API requires it. A 401 runs `onUnauthorized` (clear the session and show sign in) before the error is thrown. Every other failure becomes an `ApiError` whose `message` is shown as is. Network failures and unreadable replies get friendly messages of their own (`network`, `bad_response`).
- **Response types live in `lib/types.ts`.** `AppointmentStatus`, `Role` and `Vocabulary` are re-exported from `@evergreen/core`. The rest (me, appointments, clock, time off) are written by hand from the Sprint 1 contract, because they are shaped by the routes, not by core. `@evergreen/core` still has no react or next imports.
- **The session is one small state machine** (`lib/session.tsx`): `loading`, `signed-out`, `no-workspace`, `choosing`, `ready`, `error`. Expo Router `Stack.Protected` shows only the screens for the current state, so a signed out person cannot reach a tab.
- **Business switching rules are pure functions** (`lib/switcher.ts`, tested). One business: use it. Several and none saved: ask once. Saved id still valid: use it. Saved id gone (403 `forbidden` on `/me`): forget it and fall back to the first business. The id is saved in SecureStore and sent as `x-juniper-workspace`. More has "Switch business" when there is more than one.
- **`no_workspace` gets its own friendly screen** with "Check again" and "Sign out".
- **Today is real; Clock and Time off are read only.** Today shows `/appointments/today` (mine by default, All toggle), pull to refresh, refresh on tab focus, and status actions (Confirm, Check in, Complete, No show, Cancel). Cancel asks first and says the client will get a cancellation email when they have one, because the service sends it by default. Finished appointments (completed, cancelled, no show) show no actions; reopening is not in this sprint. Clock and Time off load `/clock` and `/time-off` and show current data with no buttons.
- **Brand comes from `@evergreen/brand`.** Light and dark tokens follow the phone setting, radius from `tokens.radius`. Fraunces (heading) and DM Sans (body) come from `@expo-google-fonts`, imported one weight at a time so only four font files ship. Words like Stylist and Client come from `workspace.vocab` in `/me`. The app icon, adaptive icon and splash are rendered from the brand mark.
- **Tabs are text only for now** (Today, Clock, Time off, More). Icons can come with the Sprint 3 polish.
- **Local dev against a dev server** needs `EXPO_PUBLIC_API_URL` on the phone side and, in Expo Go only, the `exp://` origin in the web app's `EXTRA_TRUSTED_ORIGINS`. Steps are in `apps/mobile/README.md`.
- **Not verified on a real phone in this sprint.** Checks run: typecheck, unit tests, `expo export` for Android (bundles), `expo-doctor`.

## Juniper v2, Sprint 3: Clock and Time off screens with actions (2026-11-04)

- **Clock buttons come from one pure function.** `clockButtons(clock, trackRestBreaks)` in `lib/format.ts` (tested) decides what to show: Clock in when out; Clock out, Start meal break and (only if `workspace.trackRestBreaks`) Start rest break while clocked in with no break open; End break while a break is open. Clock out stays available during a break, the server closes the break.
- **Clock writes update the screen from the answer.** Every clock write returns `{ message, clock }`, so the screen calls `setData(clock)` instead of refetching and shows the server's message in a short banner. `setData` also drops any load still in flight, so an older answer cannot overwrite the newer one. If a write fails with 400 or 409 the message is shown and `/clock` is refetched quietly so the screen matches the server (for example already clocked in on another device).
- **One request at a time.** A single `busy` value disables every clock button while a write runs, so a double tap cannot send two writes. Clock out asks first with `Alert.alert`.
- **The timer is display only.** `useTicker` ticks once a second only while someone is clocked in and the tab is focused, and clears its interval otherwise. `now` is passed into the pure formatters (`elapsedTimer`, `breakLength`, `formatTimer`), which never return a negative time if the phone clock is behind the server. The server's timestamps stay the source of truth; the timer is just the difference.
- **Time off list.** Open and Past toggle (the `scope` query), pull to refresh, status pills. Owners and managers see everyone's requests with the person's name (the server does the filtering, the app only reads `isManager(role)` for the header text). Part-day requests show their hours in the business time zone.
- **Review rules in the app mirror the server, and the server still decides.** `canReview` (tested): owners and managers, pending requests only, and no buttons on a manager's own request. Owners keep the buttons on their own request because the server allows it (`ctx.role !== "owner"` in `reviewTimeOff`). Approve and Deny open an optional note field on the card, then a Confirm button, so there is no accidental one tap decision. `canCancel` (tested): your own request while pending, or approved and not over. Cancel asks first.
- **Request time off is a modal route, `app/time-off-new.tsx`**, a screen of the root stack above the tabs (so no tab bar and `router.back()` always returns to the list). It is for yourself; the API's `membershipId` (a manager entering time off for someone else) is not used yet. The phone only checks the obvious: last day not before first day (picking a later first day moves the last day along). Every other rule comes back as the server's message.
- **Dates and times are labels, not instants.** The pickers give a `Date` on the phone; `dayFromPicker` and `timeFromPicker` read its local year, month, day, hour and minute and send `YYYY-MM-DD` and `HH:MM`. `pickerDate` builds local noon so a day can never shift. The server turns them into instants in the business time zone, so a phone in another time zone still requests the right day. Tested for a round trip.
- **The Request screen tells the list to refresh through a tiny bus** (`lib/refresh-bus.ts`, tested). On a 201 it publishes the server's message and goes back; the Time off screen refreshes and shows the message. This does not depend on how focus events pass through nested navigators.
- **Fixed the double fetch in one place.** `useLoad` now loads on mount and whenever its deps change, and refreshes quietly (no spinner) when the screen is focused again, skipping the first focus because the mount load already covered it. Screens no longer add their own `useFocusEffect`. It returns `sync()` (quiet reload), `reload()` (with spinner, for retry) and `setData()` (use an answer a write returned). Today, Clock and Time off all use it.
- **Packages.** `@react-native-community/datetimepicker` 9.2.1 (the version in Expo SDK 58's own `bundledNativeModules.json`) and `@expo/vector-icons` ^15.0.2 for the tab icons (Ionicons, imported by name, JS only, no new native module). `npx expo install` could not reach Expo's servers from the build environment, so both were added with npm at the SDK versions from that file; run `npx expo install --check` on a machine with internet to confirm.
- **Tab icons** are Ionicons, outline when idle and filled when selected, in the brand tint colors.
- **No changes to `apps/web`, `packages/core` or the API contract.**
- **Not verified on a real phone in this sprint.** The manual check list is in the PR and is still open. Checks run: typecheck, unit tests, lint, `expo export --platform android` (bundles).

## Juniper v2, Sprint 4: push notifications (2026-11-04)

- **Push goes to staff phones only, never to clients.** Clients still get email. The phone app has no client features.
- **Expo push service, tokens in `push_tokens`.** One row per token (unique index on `token`, global). Registering a token that already exists moves the row to the new business and person and clears `deleted_at`, so a shared phone or a business switch never leaves two rows. Removing sets `deleted_at` (soft delete). Every query is scoped to `ctx.workspace.id`; `POST /devices/remove` only removes a token that belongs to the caller in the active business, and is safe to call twice.
- **The phone registers after sign in, after a business switch and when the token changes, and only if the person already allowed notifications.** Permission is asked from a button in More, never at launch. It unregisters on sign out before the bearer token is cleared, with a 4 second cap so sign out never hangs. If that call fails (offline), the server still drops the token when the next person registers the same phone, and Expo receipts clean up dead tokens.
- **Choices are per person per business, stored on `memberships`** (`push_bookings`, `push_time_off`, default on), not per phone, so they follow the person between phones. A person's role differs per business, so the choice is per membership. Changing them writes an `auditRow` (`membership`, `push_settings`). Registering and removing a token do not write audit rows (high volume, not a change that matters).
- **`sendPush` never throws.** It looks up tokens for the given memberships (workspace scoped, token and membership not deleted, kind switched on), posts to Expo in batches of 100 with a 5 second timeout, and swallows and logs any failure. It is awaited next to the emails in the request, so a serverless function is not stopped before the push goes out. A failed push never fails a booking or a review.
- **DeviceNotRegistered is handled twice.** A ticket error removes the token right away. Each accepted ticket id is saved on the token row, and a daily cron (`/api/cron/push-receipts`, same `CRON_SECRET` as reminders) fetches receipts older than 15 minutes and removes tokens Expo reports as gone. Only the latest ticket per token is kept, which is enough to catch a dead phone on its next send. Vercel Hobby crons run once a day, so receipts are checked daily, not every 15 minutes.
- **Who is notified.** New booking from the website or embed, and a booking cancelled by the client: the person it is booked with, plus owners and managers. A time off request: owners and managers except the requester. A time off decision: the requester, unless they made the decision themselves (owners may review their own). Nothing is sent when a manager adds time off for someone else (it is auto approved), or when staff change an appointment in the app or on the web. Push ignores the business setting `booking.notifyStaff` (that is the staff email switch); each person's own push switch is the control.
- **Lock screen safe text.** Built by pure functions in `lib/services/push-messages.ts`: client first name, service, staff first name and time in the business time zone; for time off, a first name and dates. No phone, email, notes or time off reasons. Titles use `workspace.vocab` ("New appointment", "Client cancelled"). A test checks that an email, phone and note never appear.
- **Payload `data`** carries `type` (`booking` or `time_off`), the record id, the business id and, for bookings, the staff `membershipId`. The phone decides where a tap goes with `destinationFor` in `lib/push.ts` (tested, no react-native imports): a booking opens Today (scope Mine if it is the person's own, All otherwise), time off opens Time off. A notification for another business the person is on switches business first. One for a business they have left does nothing.
- **Phone side uses the refresh bus and router params, no new global state.** The bus gained a `today` topic. A tap navigates to Today with `scope` and a changing `t` param; a notification that arrives with the app open publishes the topic and the list refreshes quietly, while the foreground handler shows the banner.
- **The EAS project id is read from config**, never hardcoded: `extra.eas.projectId` from `EXPO_PUBLIC_EAS_PROJECT_ID` (or `EAS_PROJECT_ID`) in `app.config.ts`, or the EAS build config. When it is missing, More shows a plain message instead of the switches.
- **Android channel `default`** is created before asking for permission (Android 13 needs one) and used on every message (`channelId`).
- **New API surface:** `POST /devices`, `POST /devices/remove` (POST, not DELETE: the API requires a JSON body on writes and some clients drop bodies on DELETE), `GET` and `POST /notifications`. No offline queue; a failed settings change is rolled back on screen.
- **Packages.** `expo-notifications` ~58.1.8 and `expo-device` ~58.0.5, added with npm at the versions in Expo SDK 58's `bundledNativeModules.json` because `npx expo install` could not reach Expo's servers from the build environment. Run `npx expo install --check` where there is internet.

## Not decided yet

- Offline sync engine for the phone (build simple "changes since" sync first).
- Push provider details (Expo push service is the default plan).
- Per-business custom domains.
- Payments provider for deposits, storefront and POS.

## Storefront and Helcim payments (2026-11-13)
- Juniper owns products, stock and orders. Helcim is card payments and hardware only. Spec in `docs/storefront-spec.md`.
- Stock is an append only ledger (`stock_movements`). A unique index on order, product and reason means a replayed webhook cannot take stock out twice.
- Stock comes out only when Helcim confirms an approved payment and the amount and order state agree. Anything odd sets `payments.needs_review` and changes nothing else.
- Webhooks are verified, deduped on `webhook-id`, then the transaction is fetched from Helcim by id. The webhook body is never trusted. A failure returns 500 so Helcim retries, and every step is safe to run twice.
- One Helcim webhook URL per connected account (`/api/webhooks/helcim/<connectionKey>`) because verifier tokens are per account. Tokens are stored AES-256-GCM encrypted with `HELCIM_ENCRYPTION_KEY`.
- Only one pending payment per device, enforced by a partial unique index, because Helcim does not queue requests to a device.
- Preview deploys get their own Neon branch. The free plan allows 10 branches, so delete old `preview/*` branches when a preview fails at "Provisioning Integrations".

## Team chat (2026-11-13)
- Direct messages and groups, one level of threads, soft delete. Full spec in `docs/team-chat-spec.md`.
- Web polls every 5 seconds while the tab is visible; no websockets. Revisit if it feels slow.
- Push text never includes message content. Muted conversations get no push and do not add to the badge.
- Phone screens and the global message-push toggle wait for the app step.

## Retail industry (2026-11-13)
- New industry `retail` for stores with no appointments (first client: ReLoved Gaming). New businesses start with booking off and the shop on. Today redirects to the Register, and Calendar and Services are hidden. Time clock, team, messages and customers stay.

## Feature switches per business (2026-11-13)
- `settings.modules` (appointments, customers, timeclock, messages) plus `shop.enabled` decide which screens a business sees. Unset means the industry default: everything for appointment businesses, store-only for retail.
- Only Evergreen changes them, on the admin page (Features button). Businesses cannot hide or show screens themselves.
- Hidden screens redirect to the first screen that is on. Nothing is deleted, and turning a part back on restores it. This is a screen switch, not a permission check: services still enforce roles and the shop flag.
- Turning appointments off also turns online booking off. Turning the store off also turns the online shop off.

## Refunds and returns (2026-11-13)
- Managers only. Pick items and quantities from a paid order; sales tax is refunded in proportion to item value, and the refund that finishes the last item takes the rounding left over. Shipping is an optional extra. Total refunded can never exceed what the customer paid.
- Cash orders: the refund settles at once and the screen tells the manager to give cash back. Card orders: Helcim is called first (`POST /payment/refund`, unique idempotency key), and money, stock and order status only change when Helcim approves.
- If Helcim cannot be reached the refund stays pending. Stock does not move, nothing else can be refunded on that order, and the manager can retry (same key, so it cannot refund twice), record it as done by hand, or clear it, each with a note.
- Returned items go back on the shelf by default. A manager can untick that for damaged goods. Returns are exempt from the one-row-per-order-and-product stock rule so an order can come back in several parts.
- Unverified until test day: Helcim's refund field names, whether same-day refunds must be voids instead, and the IP address Helcim wants. The code fails closed.

## Product photos (2026-11-13)
- Photos are stored in Vercel Blob (public links, path `<workspaceId>/products/<id>.<ext>`) and the links are saved in `products.images`, same as before. Pasted https image links still work.
- The browser shrinks each photo to 1600px JPEG before upload so it stays under Vercel's request size limit. The server accepts up to 2.5 MB and checks the file's first bytes, so only real JPEG, PNG or WebP files are stored (no SVG or HTML).
- Owners and managers only. Needs `BLOB_READ_WRITE_TOKEN` (added when a Blob store is connected to the Vercel project). Without it the upload says so and the link box still works.
- Removing a photo from a product does not delete the file from Blob. Orphans are tiny and harmless for v1.
- Fixed: editing a product used to reset its images to none because the form never sent them.
