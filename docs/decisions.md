# Evergreen Digital App Template: Decisions

Every architecture decision, with the reason. Claude Code reads this before changing structure. Newest at the bottom of each section. Carried over from Grove where it still applies.

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

## Not decided yet

- Offline sync engine for the phone (build simple "changes since" sync first).
- Push provider details (Expo push service is the default plan).
- Multi-business sign-up and per-business subdomains (Juniper One foundation).
