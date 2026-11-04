# Juniper

Online booking, team schedules, the time clock and time off in one app. Built for salons first (Barclay's Salon is the pilot) and ready for any appointment business. Sold standalone and built into Evergreen Digital websites. Built from the [Evergreen Digital App Template](https://github.com/JustTegan7/evergreen-app-template).

## What v1 does
- **Many businesses, one app.** Each business has its own team, settings and booking link (`/b/<link-name>`). Evergreen admins create businesses at `/admin`.
- **Online booking** at `/b/<link-name>`, or embedded in any website with one line of code (add `data-theme="light"` or `data-theme="dark"` to the embed div to force a theme; without it the form follows the visitor's device). Service, person (or "Any available"), day and time, then contact details. Email confirmation with a link to reschedule or cancel. Optional magic link account for returning clients.
- **Processing time.** Services split into before / processing / after (plus cleanup). The staff member is free during processing, so a cut can be booked inside a color.
- **No double booking, ever.** A Postgres exclusion constraint refuses overlapping busy time for one person, even when two clients press Book at the same moment. Staff can still double book on purpose with "Book anyway".
- **Staff calendar.** Day view with a column per person, working hours, time off, now line, click to book, status (confirm, check in, complete, no show, cancel), move, notes.
- **Clients.** Search, profile, notes, visit history.
- **Schedules.** Business hours and each person's weekly hours, split shifts, one-day changes.
- **Time off.** Requests, manager approval (with a warning when appointments are affected), cancellations.
- **Time clock.** Clock in and out, meal and rest breaks, manager edits with an audit trail.
- **Timesheets.** Pay periods (weekly, every two weeks, twice a month), Washington overtime (40 hours a week) and meal break flags, CSV export for payroll.
- **Words and rules are data.** Stylist or Barber or Trainer, booking lead time, cancellation window, policy text, time clock rules: all set per business.

## Layout
```
apps/web        Next.js app: marketing site, signed-in app, public booking pages
apps/mobile     phone app (v2, Expo)
packages/core   pure rules: availability, time zones, timesheets, settings (tested)
packages/db     Drizzle schema and migrations
packages/brand  Juniper colors, fonts, logo mark
docs/           decisions, roadmap, testing, build notes
```

## Run it locally (Windows PowerShell)
```powershell
npm install
copy apps\web\.env.local.example apps\web\.env.local   # fill it in, use a Neon dev branch
npm run db:migrate
npm run dev
```
Open http://localhost:3000/login, choose **Juniper admin setup**, and create your login with an email listed in `PLATFORM_ADMINS`. Then open `/admin` to add a business.

## Vercel settings
- Root Directory: `apps/web`. Build command: default (`vercel-build` runs migrations, then `next build`).
- Domain: juniperbooking.com. Booking links look like `https://juniperbooking.com/b/barclays`.
- Environment variables: see `apps/web/.env.local.example`. Required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PLATFORM_ADMINS`, `CRON_SECRET`. For email: `RESEND_API_KEY`, `EMAIL_FROM`.
- Cron: `apps/web/vercel.json` runs the reminder emails daily at 17:00 UTC (9 or 10 AM Pacific).
- The Neon database needs the `btree_gist` extension. Migration 0002 turns it on (Neon allows it).

## Checks
`npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.
