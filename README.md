# Evergreen Digital App Template

The starting point for every Evergreen Digital web app that needs logins and a database. Pulled from Grove (thegrovecms.com) and stripped to what every app needs. No product features. For plain marketing sites with no database, use the Evergreen Digital Website Template.

## What is in the base
- Email and password logins (Better Auth), password reset by email (Resend), owner can set a temporary password
- Sign-up limited to an allowlist (`APP_TEAM`), one workspace, roles: owner, manager, member
- Signed-in app shell: side nav on desktop, bottom tabs on phones, light and dark theme, toasts
- Placeholder Home and a Team page
- Marketing site shell: header, footer, privacy and terms placeholders, SEO metadata, JSON-LD, robots, sitemap, security headers
- Neon + Drizzle with migrations that run on every Vercel deploy
- Pure TypeScript core package (dates, zod helpers, fuzzy search, file type rules) with tests
- Brand tokens package shared by web and the future phone app
- CI (typecheck, test, lint, build) and a Playwright smoke test

## Layout
```
apps/web        Next.js app: marketing site at / plus the signed-in app
apps/mobile     phone app later (Expo)
packages/core   dates, zod helpers, search, file rules (pure TypeScript, tested)
packages/db     Drizzle schema and migrations
packages/brand  colors, fonts, logo mark
docs/           decisions, roadmap, testing, SEO checklist
```

## Start a new app from this
1. On GitHub, open this repo and click **Use this template** to create the app's repo (private). To fill a repo that already exists and is empty, clone this one, point `origin` at the new repo and push.
2. Change `apps/web/lib/site-config.ts` (name, URL, copy) and `packages/brand` (colors, logo).
3. Replace the nav items in `apps/web/components/app/Nav.tsx` and the Home page.
4. Add the app's tables to `packages/db/src/schema.ts`, every one with a `workspace_id`, then `npm run db:generate`.

## Run it locally (Windows PowerShell)
```powershell
npm install
copy apps\web\.env.local.example apps\web\.env.local   # then fill it in (use a Neon dev branch)
npm run db:migrate
npm run dev
```
Open http://localhost:3000.

## Vercel settings
- Root Directory: `apps/web`
- Build command: leave default. `apps/web` has a `vercel-build` script that runs migrations, then `next build`.
- Environment variables: `DATABASE_URL` (from the Neon integration), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_TEAM`, `APP_WORKSPACE_NAME`, and later `RESEND_API_KEY`, `EMAIL_FROM`.

## Checks
`npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.
