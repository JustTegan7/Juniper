# Juniper phone app (v2)

The Expo (React Native) app goes here once salons are using the web login. See `docs/decisions.md` and `docs/roadmap.md`.

Reserved identifiers:
- App name: Juniper
- iOS bundle ID / Android package: `com.evergreendigital.juniper`
- URL scheme: `juniper`

The app reuses `@evergreen/core` (availability, timesheet and time zone rules) and `@evergreen/brand` directly. Services in `apps/web/lib/services` get `/api/v1` route handlers for it.
