# Juniper

Booking, schedules, time clock and time off for salons and other appointment businesses. Sold standalone and built into Evergreen Digital websites. Built from the Evergreen Digital App Template; improvements every app should get are listed in `docs/BUILD-NOTES.md` to copy back. Read `docs/decisions.md` before changing structure, and add to it whenever a decision is made.

## Stack
Next.js 16 App Router + TypeScript + Tailwind v4 (`apps/web`), Neon Postgres with Drizzle ORM and drizzle-kit migrations (`packages/db`), Better Auth (email and password for staff, magic links for clients), hosted on Vercel with Root Directory `apps/web`. npm workspaces monorepo. Phone app for owners and staff with Expo (`apps/mobile`, talks to `/api/v1`).

## Rules
- Many businesses share one app. Every table has `workspace_id`, and every query is scoped to `ctx.workspace.id` (staff) or to the business found by slug (public pages). Public code trusts only the slug, a manage link secret, or a signed-in client's verified email.
- All data access happens on the server. Every read and write is a service function in `apps/web/lib/services` taking `(ctx, input)`, with input validated by a zod schema. Server actions in `app/(app)/actions.ts` (staff) and `app/b/[slug]/actions.ts` (public) are thin wrappers. No business logic in components or actions.
- Domain rules live in `@evergreen/core` as pure functions: availability, time zones, timesheets, settings. `now` and `today` are passed in. Core never imports next or react (a test enforces it).
- Times: store real instants as `timestamptz`; convert to the business time zone with `zonedToUtc` / `utcToZoned`. Day-level dates are `YYYY-MM-DD` strings. Never use the server's local time.
- Appointment busy time lives in `appointment_segments` (rewritten on every change). The database exclusion constraint is the final guard against double booking; map its error with `isOverlapError`.
- Per-business choices (services, words, rules, branding) are data, never hardcoded. Use `ctx.workspace.vocab` for words like Stylist and Client in UI copy.
- Writes that must land together use `batch([...])` from `lib/db.ts`. Changes that matter (timesheets, time off, appointments, settings, team) also write an `auditRow`.
- IDs are UUIDv7. Synced tables carry `updated_at` and `deleted_at` (soft delete). No em dashes in UI copy or docs.
- Schema changes: edit `packages/db/src/schema.ts`, run `npm run db:generate`, commit the new migration. Vercel applies migrations on every deploy.
- Before committing: `npm run typecheck && npm test && npm run lint && npm run build`.
