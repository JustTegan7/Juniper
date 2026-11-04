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
| POST | `/api/v1/devices` | `{ token, platform: "ios" \| "android" }` | `{ message }` (register or refresh this phone for the active business; the row moves if the token was elsewhere) |
| POST | `/api/v1/devices/remove` | `{ token }` | `{ message }` (stop pushes to this phone; safe twice) |
| GET | `/api/v1/notifications` | | `{ bookings, timeOff }` (this person's push choices, default on) |
| POST | `/api/v1/notifications` | `{ bookings?, timeOff? }` | the new `{ bookings, timeOff }` |

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

## Sprint 4: push notifications (2026-11-04) - done

Branch `v2/push`. Decisions are in `docs/decisions.md` under "Juniper v2, Sprint 4".

### Built
- API: table `push_tokens` and two columns on `memberships` (`push_bookings`, `push_time_off`), migration `0003`. `POST /devices`, `POST /devices/remove`, `GET` and `POST /notifications` (see the contract table). Services `lib/services/devices.ts` and `lib/services/push.ts`, message text in `lib/services/push-messages.ts`, the Expo call in `lib/expo-push.ts`.
- Pushes: new booking from the website or embed, and a booking cancelled by the client (the person it is booked with, plus owners and managers); a time off request (owners and managers except the requester); a time off decision (the requester, never the person who decided).
- Cron `/api/cron/push-receipts` (daily, `CRON_SECRET`) removes tokens Expo reports as DeviceNotRegistered.
- Phone: expo-notifications and expo-device, config plugin, Android channel, foreground banner plus quiet refresh, tap opens Today (scope All for someone else's booking) or Time off, switches business first when needed. Registers after sign in, business switch and token change; unregisters on sign out. More has a Notifications card: explains what you get, turns them on, handles denied (how to turn on in Settings) and shows a switch per kind from the server.
- Tests: web 77 (was 51; new `lib/push.test.ts` runs against PGlite with the real migrations and a mocked Expo call and asserts who is and is not notified), mobile 84 (was 64; `lib/push.ts` rules, API calls).

### How it was checked
Root `typecheck`, `test` (mobile 84, web 77, core 30) and `lint` pass; `expo export --platform android` bundles. Not run here: root `build` (next/font cannot download Google Fonts without internet; the new routes compile under `tsc`) and the two network checks of `npx expo-doctor` (18 of 20 pass; the Expo config schema check and the React Native Directory check need Expo's servers). `npx expo install` also could not reach Expo, so the two packages were added with npm at the SDK 58 versions: run `npx expo install --check` where there is internet.

### Before pushes can work for real
- Create the EAS project (`npx eas init` in `apps/mobile`) and set `EXPO_PUBLIC_EAS_PROJECT_ID` (local `.env.local`, and EAS env for builds).
- Android needs Firebase Cloud Messaging credentials uploaded to Expo (`google-services.json` for the build, FCM V1 service account key in EAS credentials). iOS needs an Apple developer account and a push key (EAS manages it).
- Push needs a development build on a real phone. Expo Go on Android cannot receive remote pushes (SDK 53 and later); Expo Go on iOS is limited. Simulators cannot get a token.
- `CRON_SECRET` must be set in Vercel (already used by reminders). Optional `EXPO_ACCESS_TOKEN` if Enhanced push security is turned on.

### Manual check (NOT done, needs a real phone and a dev server)
Turn notifications on in More. Book from the website as a client: the person booked with, owners and managers get a push; tapping opens Today (All when it is someone else's). Cancel it from the manage link: same people. Request time off as a team member: managers get a push. Approve and deny as a manager: the requester gets a push and tapping opens Time off. The person who made the change gets none. Turn each kind off in More and confirm it stops (and that it follows you to a second phone). Sign out and confirm that phone stops getting pushes. Deny permission in the system and check the Settings help. Also the open Sprint 3 check: clock in, break, clock out, request, cancel, approve, deny, light and dark, pickers on iOS and Android.

### Not in Sprint 4
- No push for appointments staff change in the app or web, rescheduled-by-client bookings, new clients, or reminders to staff before a shift.
- No per-device choices (choices follow the person), no quiet hours, no badge counts, no notification inbox.
- Receipts are checked once a day (Vercel Hobby cron limit), and only the latest ticket per token is kept.
- No monochrome Android notification icon yet (the app icon is used).
- Not tried on a real phone.

## Sprint 5: store builds with EAS - next

App icons and splash check, bundle ID and package, production API URL and `BETTER_AUTH_URL`, TestFlight and Play internal testing, privacy details.
