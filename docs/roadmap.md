# Juniper One roadmap

## v1: online booking and the employee portal (built 2026-11-02)
Booking page and embed, staff calendar, clients, services with processing time, schedules, time off, time clock, timesheets with CSV, email confirmations and reminders, multi-business admin. Pilot: Barclay's Salon, switching from Envision once v1 is live.

### Before Barclay's goes live
- [x] Domain: juniperbooking.com (on Vercel). Set `BETTER_AUTH_URL=https://juniperbooking.com` in Vercel production
- [ ] Create the Vercel project and Neon database, set env vars (see README)
- [ ] Set up Resend on juniperbooking.com (invites, confirmations, reminders, resets)
- [ ] Create Barclay's in `/admin`, invite Ryan, enter his real services, prices and processing times
- [ ] Each stylist: invite, weekly schedule, which services they do, price differences
- [ ] Add the embed code to barclaysalon.com and link it from Google Business Profile
- [ ] Run a week in parallel with Envision before switching
- [ ] Have Barclay's payroll provider confirm the CSV columns and the time clock rules

### Small v1 follow-ups
- Week view on the calendar, and drag to move
- Several services in one visit (the `visit_id` column is ready) and add-ons
- Client import from a CSV (Envision export) if a new salon needs it
- Waitlist when a day is full
- Deposits or a card on file for no-show protection (needs payments, see v4)

## v2: phone app
Expo app for staff: today's schedule, clock in and out, time off, push notifications for new bookings and approvals. `/api/v1` route handlers over the same services.

## v3: storefront
Online shop for retail products, tied to the Evergreen storefront template. Replaces Barclay's current shop provider.

## v4: POS
Checkout at the front desk, tips, gift cards, sales reports, commissions. Payment provider to be decided (Helcim is the Evergreen storefront candidate).

## Later
- SMS confirmations and reminders (Twilio, needs A2P 10DLC registration). The email layer in `lib/notify.ts` is where it plugs in.
- Multiple locations per business
- Custom domains per business (book.barclaysalon.com), or subdomains like barclays.juniperbooking.com
- Connect to Grove and other Evergreen apps through Canopy once clients use more than one
