import type { Metadata } from "next";
import { Section } from "../../../components/sections/Section";
import { pageMetadata } from "../../../lib/seo";
import { siteConfig } from "../../../lib/site-config";

export const metadata: Metadata = pageMetadata({ title: "Privacy", description: `How ${siteConfig.businessName} handles your data.`, path: "/privacy" });

const LIST = "list-disc space-y-1 pl-5";
const H = "pt-4 text-base font-semibold text-ink";

export default function PrivacyPage() {
  return (
    <Section heading="Privacy">
      <div className="mx-auto max-w-2xl space-y-4 text-sm text-muted">
        <p>
          {siteConfig.businessName} is booking, scheduling, time clock and storefront software made by {siteConfig.parent}. Each business that uses it is responsible for the information it puts in. This page explains what {siteConfig.businessName} collects, why, and how to have it deleted. Last updated November 2026.
        </p>

        <h2 className={H}>What Juniper collects</h2>
        <ul className={LIST}>
          <li>Team accounts: name, email address and a password (stored hashed, never in plain text), plus the role and job title a business gives you.</li>
          <li>What a business enters: services, hours, team schedules, appointments, client names, emails and phone numbers, notes, time clock entries, time off requests and team chat messages.</li>
          <li>Pay settings, if an owner chooses to add them for payroll hours exports. Only owners can see them.</li>
          <li>Clients who book online: the name, email and phone number they give, so the business can confirm and remind them. Clients can book as a guest or sign in with a link sent to their email.</li>
          <li>Products, stock, orders and payment status for businesses that use the storefront and point of sale. Card payments are handled by Helcim. Juniper never sees or stores full card numbers.</li>
          <li>If you turn on notifications in the phone app, a push notification token for your device, so alerts reach your phone.</li>
        </ul>

        <h2 className={H}>What Juniper does not collect</h2>
        <ul className={LIST}>
          <li>No advertising, no ad identifiers and no tracking across other apps or sites.</li>
          <li>No location data, contacts or photo library access from the phone app.</li>
          <li>We do not sell your data.</li>
        </ul>

        <h2 className={H}>Who handles data for us</h2>
        <p>
          Juniper uses a small set of providers to run: Vercel (hosting and file storage), Neon (database), Resend (email), Helcim (card payments and card readers) and Expo (delivering push notifications). They process data only to provide those services.
        </p>

        <h2 className={H}>How long we keep it</h2>
        <p>
          Data stays while a business is active. Appointments, timesheets and payroll hours belong to the business and are kept for its records, so when a person deletes their account, their name and login are removed but those records remain without their name.
        </p>

        <h2 className={H}>Deleting your account</h2>
        <p>
          You can delete your account at any time from the More tab in the phone app, or by emailing us. See{" "}
          <a className="underline" href="/delete-account">how to delete your account and data</a>. Clients who booked online can ask the business, or us, to delete their details.
        </p>

        <h2 className={H}>Contact</h2>
        <p>
          Questions about privacy: <a className="underline" href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.
        </p>
      </div>
    </Section>
  );
}
