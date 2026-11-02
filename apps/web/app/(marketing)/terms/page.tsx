import type { Metadata } from "next";
import { Section } from "../../../components/sections/Section";
import { pageMetadata } from "../../../lib/seo";
import { siteConfig } from "../../../lib/site-config";

export const metadata: Metadata = pageMetadata({ title: "Terms", description: `Terms for using ${siteConfig.businessName}.`, path: "/terms" });

// Placeholder. Replace with reviewed terms of service before any app opens to the public.
export default function TermsPage() {
  return (
    <Section heading="Terms">
      <div className="mx-auto max-w-2xl space-y-4 text-sm text-muted">
        <p>{siteConfig.businessName} is in early access and offered to invited teams as is. Full terms of service will be posted here before it opens to the public.</p>
      </div>
    </Section>
  );
}
