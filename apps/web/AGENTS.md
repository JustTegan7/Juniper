# Evergreen Digital App Template

The starting point for every Evergreen Digital web app that needs logins and a database (Evergreen Canopy, Juniper, and what comes next). It was pulled from Grove (thegrovecms.com) and stripped to the parts every app needs. For plain marketing sites with no database, use the Evergreen Digital Website Template instead. Read `docs/decisions.md` before changing structure, and add to it whenever a decision is made.

## Stack
Next.js 16 App Router + TypeScript + Tailwind v4 (`apps/web`), Neon Postgres with Drizzle ORM and drizzle-kit migrations (`packages/db`), Better Auth (email and password, tables in Neon via the Drizzle adapter), hosted on Vercel with Root Directory `apps/web`. npm workspaces monorepo. Phone app later with Expo (`apps/mobile`).

## Rules
- All data access happens on the server. Every read and write is a service function in `apps/web/lib/services` taking `(ctx, input)`, with input validated by a zod schema, and every query scoped to `ctx.workspace.id`. Server actions in `app/(app)/actions.ts` are thin wrappers. No business logic in components or actions.
- Domain rules live in `@evergreen/core` as pure functions. `today` is passed in, computed in the workspace or user time zone, never read from the server clock inside core. Core never imports next or react (a test enforces it).
- Per-business choices (services, roles, policies, branding, feature toggles) are data in the database, never hardcoded.
- IDs are UUIDv7. Synced tables carry `updated_at` and `deleted_at` (soft delete).
- Day-level dates are `YYYY-MM-DD` strings. Store real times as `timestamptz`. No em dashes in UI copy or docs.
- Schema changes: edit `packages/db/src/schema.ts`, run `npm run db:generate`, commit the new migration. Vercel applies migrations on every deploy.
- Before committing: `npm run typecheck && npm test && npm run lint && npm run build`.
