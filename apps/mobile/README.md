# Juniper phone app (v2)

The Expo (React Native) app for owners and staff. No client booking in the app; clients book through the website or the embed. It talks to the `/api/v1` route handlers in `apps/web/app/api/v1`. The contract is in `docs/v2-progress.md`, decisions are in `docs/decisions.md`.

Identifiers:
- App name: Juniper
- iOS bundle ID / Android package: `com.evergreendigital.juniper`
- URL scheme: `juniper`
- Expo SDK 58, Expo Router, TypeScript

## What is in it (Sprint 2)

- Email and password sign in (Better Auth `expoClient`, token in SecureStore)
- Business switcher for people on more than one business, and a friendly screen for people on none
- Tabs: Today (real), Clock and Time off (read only for now), More (who you are, business, switch business, sign out)

## Run it locally against a dev server

1. Install once from the repo root: `npm install`.
2. Start the web app: `npm run dev` (it listens on port 3000). Use a database with a staff account you can sign in with.
3. Find your computer's address on the Wi-Fi network (for example `192.168.1.50`). A phone cannot use `localhost`.
4. Tell the app where the API is. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` and set:

   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
   ```

   There is no default. Without it the app shows an error screen that says what to set.
5. Allow the phone's sign in origin on the web app. Better Auth checks where the sign in request comes from.
   - A development build (or any build of the app) sends `juniper://`, which is already trusted. Nothing to do.
   - Expo Go sends an `exp://` origin. Add it to `EXTRA_TRUSTED_ORIGINS` in `apps/web/.env.local` (comma separated, local testing only, never in code or in Vercel production):

     ```
     EXTRA_TRUSTED_ORIGINS=exp://192.168.*.*:*/*
     ```

     Restart `npm run dev` after changing it. If your network uses a different range, use your own address, for example `exp://10.0.0.*:*/*`.
6. Start the app: `npm run start -w @evergreen/mobile` (or `npx expo start` inside `apps/mobile`). Open it with Expo Go by scanning the QR code, or press `i` or `a` for a simulator.

Notes:
- The phone and the computer must be on the same Wi-Fi network.
- Plain `http://` to a LAN address works in Expo Go and dev builds. A store build must use the real `https` address (`https://juniperbooking.com`) and the production `BETTER_AUTH_URL`.
- If sign in fails with an origin error, step 5 is the usual cause.

## Checks

From the repo root: `npm run typecheck && npm test && npm run lint && npm run build`. In `apps/mobile`: `npx expo-doctor` (needs internet access to Expo's servers).

## How it is built

- `app/` screens (Expo Router). `app/_layout.tsx` shows only the screens for the current session state.
- `lib/api.ts` typed API client (headers, `{ data }` and `{ error }` parsing, sign out on 401). Plain TypeScript, unit tested.
- `lib/types.ts` response shapes in one file, re-using `@evergreen/core` types where they exist.
- `lib/session.tsx` the session state machine. `lib/switcher.ts` the business switcher rules (tested).
- `lib/auth-client.ts` Better Auth client. `lib/storage.ts` SecureStore for the token and business id.
- `lib/theme.ts` colors, radius and fonts from `@evergreen/brand` (light and dark). Fraunces for headings, DM Sans for everything else.
- Words like Stylist and Client come from `workspace.vocab` in `/me`. No em dashes in UI copy.

The app reuses `@evergreen/core` (time zone, status labels, formatting) and `@evergreen/brand` directly. Keep react and next out of `@evergreen/core` (a test enforces it).
