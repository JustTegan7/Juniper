# Testing

- `npm test` (root): unit tests for `@evergreen/core` and the web app. Runs in CI.
- `npm run e2e -w @evergreen/web`: Playwright smoke test.

## Smoke test setup (once)

1. `npx playwright install chromium` (inside `apps/web`).
2. Use a Neon **dev** branch in `apps/web/.env.local`, never production.
3. Add a test admin for local runs only, for example in `.env.local`: `PLATFORM_ADMINS=e2e@evergreendigitalco.com`, create that login once at http://localhost:3000/login (Juniper admin setup), then create a test business at `/admin` with "Add me as an owner" ticked.
4. Run it:

```powershell
$env:E2E_EMAIL="e2e@evergreendigitalco.com"; $env:E2E_PASSWORD="<the test password>"; npm run e2e -w @evergreen/web
```

Without `E2E_EMAIL` and `E2E_PASSWORD` only the public checks run (homepage, signed-out redirect). The signed-in check logs in, lands on Today and opens the Calendar.

## What the core tests cover
- Time zones: Pacific standard and daylight time, the spring-forward gap and fall-back day.
- Availability: working windows, split shifts, dated changes, business hours, lead time, time off, booking inside processing time, "Any available" picking.
- Timesheets: unpaid meals, missed, short and late meal flags, open shifts, weekly overtime on the right day, overtime across a pay period that starts mid-week, pay period math.
- Settings: defaults, industry words, link names, prices.
