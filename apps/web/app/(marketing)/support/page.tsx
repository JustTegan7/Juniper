import type { Metadata } from "next";
import { Section } from "../../../components/sections/Section";
import { pageMetadata } from "../../../lib/seo";
import { siteConfig } from "../../../lib/site-config";

export const metadata: Metadata = pageMetadata({ title: "Support", description: `Get help with ${siteConfig.businessName}.`, path: "/support" });

export default function SupportPage() {
  return (
    <Section heading="Support">
      <div className="mx-auto max-w-2xl space-y-4 text-sm text-muted">
        <p>
          Need help with {siteConfig.businessName}? Email <a className="underline" href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a> and a person will reply, usually within one business day.
        </p>
        <p>
          Privacy questions are covered on the <a className="underline" href="/privacy">privacy page</a>. To remove your account, see <a className="underline" href="/delete-account">delete your account</a>.
        </p>
      </div>
    </Section>
  );
}
