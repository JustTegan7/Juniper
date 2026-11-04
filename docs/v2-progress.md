# Juniper v2 progress

v2 is the phone app for owners and staff. No client booking in the app; clients book through the website, booking page or embed. Decisions are in `docs/decisions.md` under "Juniper v2".

## Sprint 1: API layer and mobile login (2026-11-04) - done

Branch `v2/api-layer`.

### Built
- `/api/v1` route handlers in `apps/web/app/api/v1`, thin wrappers over `lib/services`. Shared plumbing in `apps/web/lib/api.ts`.
- One ctx resolver for web and phone: `ctxForUser` in `lib/services/ctx.ts`. Web uses the `jo_ws` cookie (unchanged). Phone uses the `x-juniper-workspace` header, strict.
- Mobile login: Better Auth `expo()` and `bearer({ requireSignature: true })` in `lib/auth.ts`, `juniper://` trusted. Staff email and password login works as before on the web.
- `NotFoundError` in ctx, used for missing appointments and time off, so the API returns 404.
- `/api/v1/` added to the public prefixes in `proxy.ts` (handlers check the session themselves).
- Tests: `lib/api.test.ts` (19 tests: auth failures, wrong business, owner, manager and member rules, clock flow) and `lib/auth.test.ts` (phone plugins in the real auth config).
- New dependency: `@better-auth/expo` in `apps/web` (server plugin only; its Expo peers are optional). `better-auth` range raised to `^1.7.14` to match.

### API contract

Every call sends `Authorization: Bearer <token>` and, after the person picks a business, `x-juniper-workspace: <business id>`. Writes send `Content-Type: application/json`.

Success: `{ "data": ... }`. Failure: `{ "error": { "code", "message" } }` with codes `unauthorized` (401), `no_workspace` / `forbidden` (403), `not_found` (404), `conflict` (409), `invalid` (400), `unsupported_media_type` (415), `server_error` (500). `message` is safe to show people.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/auth/sign-in/email` | `{ email, password }` | Better Auth session; token in the `set-auth-token` header |
| POST | `/api/auth/sign-out` | | Ends the session |
| GET | `/api/v1/me` | | `user`, `role`, `membershipId`, `today`, `workspace` (id, name, slug, timezone, brandColor, vocab, trackRestBreaks), `workspaces` |
| POST | `/api/v1/me/workspace` | `{ workspaceId }` | `me` for that business (then send it in the header) |
| GET | `/api/v1/appointments/today?scope=mine\|all` | | `day`, `timezone`, `scope`, `canEditAll`, `staff[]`, `appointments[]` |
| POST | `/api/v1/appointments/:id/status` | `{ status, notifyClient? }` | `{ message }` |
| GET | `/api/v1/clock` | | `clockedIn`, `entry`, `breaks[]`, `openBreak` |
| POST | `/api/v1/clock/in` | | `{ message, clock }` |
| POST | `/api/v1/clock/out` | | `{ message, clock }` |
| POST | `/api/v1/clock/breaks/start` | `{ kind: "meal" \| "rest" }` | `{ message, clock }` |
| POST | `/api/v1/clock/breaks/end` | | `{ message, clock }` |
| GET | `/api/v1/time-off?scope=open\|past` | | `{ scope, requests[] }` (managers see everyone, members their own) |
| POST | `/api/v1/time-off` | `{ startDay, endDay, allDay?, startTime?, endTime?, reason?, membershipId? }` | 201 `{ message, id }` |
| POST | `/api/v1/time-off/:id/review` | `{ decision: "approved" \| "denied", note? }` | `{ message }` (owners and managers; managers cannot review their own) |
| POST | `/api/v1/time-off/:id/cancel` | | `{ message }` |

Appointment statuses: `booked`, `confirmed`, `checked_in`, `completed`, `cancelled`, `no_show`. Times are ISO instants; days are `YYYY-MM-DD` in the business time zone.

### Not in Sprint 1
- No Expo app yet (built in Sprint 2).
- No push notifications, no offline sync, no rate limit on `/api/v1` beyond Better Auth's on `/api/auth`.
- Before a real phone build: add the production `BETTER_AUTH_URL` and any `exp://` dev origin to `EXTRA_TRUSTED_ORIGINS` for local testing only.

## Sprint 2: Expo app shell (2026-11-04) - done

Branch `v2/expo-shell`. Decisions are in `docs/decisions.md` under "Juniper v2, Sprint 2".

### Built
- Expo SDK 58 app in `apps/mobile` (`@evergreen/mobile`, npm workspace), Expo Router, TypeScript. Name Juniper, scheme `juniper`, `com.evergreendigital.juniper`.
- Sign in with email and password (`expoClient`, token from `set-auth-token` in SecureStore). Sign out clears the token and the saved business.
- API client `lib/api.ts`: bearer and `x-juniper-workspace` headers, `{ data }` and `{ error }` parsing, sign out on 401, friendly network errors. Types in `lib/types.ts`.
- App shell: signed out goes to sign in; signed in loads `/me`; business switcher for several businesses (saved in SecureStore, sent as the header); friendly `no_workspace` screen.
- Tabs: Today (appointments, mine or all, pull to refresh, Confirm, Check in, Complete, No show, Cancel with confirm), Clock and Time off (read only), More (you, business, switch business, sign out).
- Brand from `@evergreen/brand` (light and dark), Fraunces and DM Sans, words from `workspace.vocab`. App icon, adaptive icon and splash from the brand mark.
- Tests: 28 in `apps/mobile/lib` (API client headers, 401 sign out, error parsing, business switcher, status actions).

### How it was checked
Root `typecheck`, `test`, `lint` and `build`; `expo export --platform android` (bundles); `npx expo-doctor` (see the PR for results).

### Not in Sprint 2
- Not tried on a real phone or simulator yet. Do that before Sprint 3 (README has the steps).
- No clock in or out, breaks, or time off actions (Sprint 3). Today has no reopen for finished appointments.
- Tab icons, offline support, push notifications, store builds (EAS) are later.
- `/api/v1` has no response types shared with the web; the phone types in `lib/types.ts` are written by hand from the contract above. If a route changes, update them.

## Sprint 3: Clock and Time off screens with actions (2026-11-04) - done

Branch `v2/clock-timeoff`. Decisions are in `docs/decisions.md` under "Juniper v2, Sprint 3".

### Built
- Clock tab: Clock in, Clock out (asks first), Start meal break, Start rest break (only when `trackRestBreaks`), End break. Time clocked in, a live timer that ticks only while the tab is focused and someone is clocked in, the open break with its own timer, and today's breaks with their lengths. Updates from the `{ message, clock }` answer, short confirmation banner, buttons disabled while a request runs, 400 or 409 shows the message and refetches `/clock`.
- Time off tab: Open and Past, pull to refresh, status pills, names for owners and managers. Cancel (own pending or upcoming approved, with a confirm). Approve and Deny for owners and managers on pending requests with an optional note (no buttons on a manager's own request).
- Request time off modal (`app/time-off-new.tsx`): first day, last day, all day switch, start and end time, optional reason, system date and time pickers. Server messages for everything but "last day before first day".
- API client: `clockIn`, `clockOut`, `startBreak(kind)`, `endBreak`, `requestTimeOff(input)`, `reviewTimeOff(id, decision, note?)`, `cancelTimeOff(id)`. New types `ClockActionResponse`, `CreateTimeOffResponse`, `TimeOffInput`, `BreakKind`, `TimeOffDecision`.
- Polish: `useLoad` no longer fetches twice on first open (see decisions); tab icons (Ionicons); shared `Input` and `NoticeBanner` components.
- Tests: 64 in `apps/mobile/lib` (was 28): API paths, methods and bodies for every new call, 401 sign out on writes, timer and break formatting, clock button rules, review and cancel rules, picker round trips, request body building, refresh bus.

### How it was checked
Root `typecheck`, `test` (mobile 64, web 51, core 30) and `lint` pass; `expo export --platform android` bundles. Not run here: root `build` (next/font cannot download Google Fonts without internet; `apps/web` is unchanged) and `npx expo-doctor` (18 of 20 checks pass; the Expo config schema check and the React Native Directory check need Expo's servers). `npx expo install` also needed those servers, so the two new packages were added with npm at the SDK 58 versions.

### Manual check (still open, needs a phone or simulator)
Sign in, clock in, start and end a meal break, clock out. Request time off as a team member, cancel it, request again. As an owner or manager, approve and deny a request, and confirm a manager cannot review their own. Check light and dark mode. Check the date and time pickers on both iOS and Android.

### Not in Sprint 3
- Not tried on a real phone or simulator yet.
- A manager entering time off for someone else (the API accepts `membershipId`; the app only requests for yourself).
- Managers cancelling other people's requests, and changing an approved request from the app (Deny on an approved request is possible on the server, not offered here).
- Timesheet view, editing clock entries, offline support, push notifications, store builds.

## Sprint 4: push notifications - next

Push for new bookings and time off decisions (Expo push service). Prompt for it is in the Sprint 3 PR.
