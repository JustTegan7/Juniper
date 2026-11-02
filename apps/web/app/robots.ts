import type { MetadataRoute } from "next";
import { siteConfig } from "../lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/home", "/team", "/login", "/reset-password", "/api/"] },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
