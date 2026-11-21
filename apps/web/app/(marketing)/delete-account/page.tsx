import type { Metadata } from "next";
import { Section } from "../../../components/sections/Section";
import { pageMetadata } from "../../../lib/seo";
import { siteConfig } from "../../../lib/site-config";

export const metadata: Metadata = pageMetadata({ title: "Delete your account", description: `How to delete your ${siteConfig.businessName} account and data.`, path: "/delete-account" });

const LIST = "list-decimal space-y-1 pl-5";
const H = "pt-4 text-base font-semibold text-ink";

export default function DeleteAccountPage() {
  return (
    <Section heading="Delete your account">
      <div className="mx-auto max-w-2xl space-y-4 text-sm text-muted">
        <p>You can delete your {siteConfig.businessName} account yourself, or ask us to do it.</p>

        <h2 className={H}>In the app</h2>
        <ol className={LIST}>
          <li>Sign in to the Juniper phone app.</li>
          <li>Open the More tab.</li>
          <li>Tap Delete my account and type your email address to confirm.</li>
        </ol>

        <h2 className={H}>By email</h2>
        <p>
          If you cannot sign in, email <a className="underline" href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a> from the address on your account with the subject line Delete my account. We delete it within 30 days and confirm by reply.
        </p>

        <h2 className={H}>What gets deleted</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your login and password, your name and email address, and any push notification token for your devices. You are signed out everywhere and removed from every business you were on.</li>
          <li>Appointments, timesheets and payroll hours belong to the business, so they stay in its records, shown as Former team member instead of your name.</li>
          <li>If you are the only owner of a business that still has other people on it, make someone else an owner first. If you are the last person on a business, the business is deactivated, and you can email us to have its remaining data permanently deleted.</li>
        </ul>
        <p>Deletion cannot be undone.</p>
      </div>
    </Section>
  );
}
