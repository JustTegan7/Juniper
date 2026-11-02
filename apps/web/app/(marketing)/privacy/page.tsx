import type { Metadata } from "next";
import { Section } from "../../../components/sections/Section";
import { pageMetadata } from "../../../lib/seo";
import { siteConfig } from "../../../lib/site-config";

export const metadata: Metadata = pageMetadata({ title: "Privacy", description: `How ${siteConfig.businessName} handles your data.`, path: "/privacy" });

// Placeholder. Replace with a reviewed privacy policy before any app opens to the public.
export default function PrivacyPage() {
  return (
    <Section heading="Privacy">
      <div className="mx-auto max-w-2xl space-y-4 text-sm text-muted">
        <p>{siteConfig.businessName} is in early access and is used by invited teams only. This page will be replaced with a full, reviewed privacy policy before it opens to the public.</p>
        <p>We store the information your team enters so the app can do its job. We do not sell your data.</p>
      </div>
    </Section>
  );
}
