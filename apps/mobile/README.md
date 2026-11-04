# Juniper phone app (v2)

The Expo (React Native) app for owners and staff goes here. No client booking in the app. The API it talks to is built (Sprint 1); the app shell is Sprint 2. See `docs/v2-progress.md` for the API contract. See `docs/decisions.md` and `docs/roadmap.md`.

Reserved identifiers:
- App name: Juniper
- iOS bundle ID / Android package: `com.evergreendigital.juniper`
- URL scheme: `juniper`

The app reuses `@evergreen/core` (availability, timesheet and time zone rules) and `@evergreen/brand` directly. It calls the `/api/v1` route handlers in `apps/web/app/api/v1`, which wrap the services in `apps/web/lib/services`.

Sign in: `expoClient` from `@better-auth/expo/client` with `expo-secure-store`, scheme `juniper`. Send `Authorization: Bearer <token>` (the `set-auth-token` value) and `x-juniper-workspace: <business id>` on every API call.
