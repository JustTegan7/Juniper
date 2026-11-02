import { siteConfig } from "./site-config";

/** SoftwareApplication JSON-LD for the marketing site. */
export function softwareSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.businessName,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: siteConfig.defaultDescription,
    url: siteConfig.url,
    publisher: { "@type": "Organization", name: siteConfig.parent, url: siteConfig.parentUrl },
  };
}
