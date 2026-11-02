import type { Metadata } from "next";
import { siteConfig } from "./site-config";

/**
 * Base metadata for the root layout. Individual pages can spread this
 * and override `title`/`description` as needed:
 *
 *   export const metadata: Metadata = {
 *     ...baseMetadata,
 *     title: "Services",
 *     description: "...",
 *   };
 */
export const baseMetadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.defaultTitle,
    template: siteConfig.titleTemplate,
  },
  description: siteConfig.defaultDescription,
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.businessName,
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    images: [siteConfig.ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: siteConfig.url,
  },
};

/** Build page-specific metadata without repeating the OG/Twitter boilerplate. */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path?: string; // e.g. "/services"
}): Metadata {
  const canonical = opts.path ? `${siteConfig.url}${opts.path}` : siteConfig.url;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: canonical,
    },
    twitter: {
      title: opts.title,
      description: opts.description,
    },
  };
}
