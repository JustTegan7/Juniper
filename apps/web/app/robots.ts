import type { MetadataRoute } from "next";
import { siteConfig } from "../lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/today", "/calendar", "/clients", "/clock", "/time-off", "/timesheets", "/services", "/team", "/settings", "/more", "/admin", "/welcome", "/join", "/login", "/reset-password", "/embed/", "/api/"] },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
