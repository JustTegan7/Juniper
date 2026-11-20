# Store checklist (Juniper phone app, iPhone first)

The phone app is for owners and staff only. Clients book on the website, so the app has no client sign up and sells nothing. Reviewers never meet a paywall.

## Before building
- [ ] The `v2/store-readiness` pull request is merged, and so is `v1/pay-profiles-2` if it is shipping in this release. Merge pay profiles first.
- [ ] Vercel deploy of juniperbooking.com is green and migrations ran.
- [ ] `support@evergreendigitalco.com` (set in `apps/web/lib/site-config.ts` as `supportEmail`) is a real mailbox you read. The stores and the privacy page point to it.
- [ ] These pages load when logged out: https://juniperbooking.com/privacy, /support, /delete-account.
- [ ] Try the app on your phone first (Expo Go, steps in `apps/mobile/README.md`): sign in, Today, Clock in and out, Time off request, notifications screen, Delete account screen (do not confirm it on a real login).
- [ ] Run on your laptop: `npm run typecheck && npm test && npm run lint && npm run build`. The new `account.test.ts` needs to pass.

## Reviewer demo account (isolated from real businesses)
Team logins need an invite, so make the demo through the platform admin:
1. Sign in at juniperbooking.com as your platform admin email (`PLATFORM_ADMINS` env var on Vercel).
2. Go to /admin and create a business called "Demo Salon" (template: salon).
3. Invite a dedicated owner email (for example appreview@evergreendigitalco.com), open the invite link and set a strong password.
4. Sign in as that owner and add a few services, two staff members (a second invite or a name only), and 3 to 5 appointments for today so the Today tab is not empty. Add one pending time off request so Time off is not empty.
5. Put the email and password in App Store Connect under App Review Information (Sign-in required).

## Build and submit (iPhone)
1. `npm i -g eas-cli`, `eas login`, then in `apps/mobile` run `eas init` (first time only).
2. `eas init` prints a project ID. Put it in `apps/mobile/eas.json` under `build.production.env` as `"EXPO_PUBLIC_EAS_PROJECT_ID": "<id>"` (push notifications need it) and commit.
3. `eas build --platform ios --profile production`, then `eas submit --platform ios`. EAS asks you to sign in to Apple and makes the certificates.
4. In App Store Connect: create the app (bundle ID `com.evergreendigital.juniper`), fill in the listing below, attach the build, answer App Privacy, submit for review.

## Listing text
- **Name**: Juniper
- **Subtitle**: Salon schedule and time clock
- **Category**: Business
- **Description**: Juniper keeps your day in one place. See today's appointments and update their status, clock in and out with meal and rest breaks, request and approve time off, and message your team. Built for salons and appointment businesses. Your business sets up online booking on its website, and this app is for the owners and staff who run it.
- **Keywords**: salon,booking,schedule,time clock,appointments,staff,time off,team chat
- **Support URL**: https://juniperbooking.com/support
- **Privacy policy URL**: https://juniperbooking.com/privacy
- **Marketing URL**: https://juniperbooking.com
- **Review notes**: Juniper is a login-only tool for salon owners and staff. Sign in with the demo account. Accounts are created by invitation from a business, so there is no sign up screen. Account deletion is in the More tab. The app sells nothing and shows no prices.

## Apple: App Privacy answers
- Contact info (name, email, phone numbers of staff and of clients the business enters), user content (notes, team chat messages), other data (time clock entries): linked to the user, used for app functionality only.
- Identifiers: device push token (only if notifications are on), app functionality only.
- Tracking: No. Ads: none. Location, contacts, photos, camera: not used.
- Encryption: standard HTTPS only (`ITSAppUsesNonExemptEncryption` is false).

## Screenshots
- iPhone 6.9 inch (required). Take them from the demo account: Today, Clock, Time off, a team chat.

## Known limits
- Android is not in this release. Google Play needs its own listing, Data safety answers and a manual first upload.
- No 2FA on Juniper logins yet.
- The privacy page is written from what the app does today. Have it reviewed before you rely on it, and update it when Juniper starts collecting anything new.
