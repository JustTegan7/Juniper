import type { NextConfig } from "next";

// Security headers mirrored from evergreendigitalco.com's vercel.json.
const base = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@evergreen/core", "@evergreen/db", "@evergreen/brand"],
  async headers() {
    return [
      // Everything except the embed refuses to be framed.
      { source: "/((?!embed/).*)", headers: [...base, { key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] },
      // The booking embed is made to sit inside a business's own website.
      { source: "/embed/:path*", headers: [...base, { key: "Content-Security-Policy", value: "frame-ancestors *" }] },
      { source: "/embed.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }, { key: "Access-Control-Allow-Origin", value: "*" }] },
    ];
  },
};

export default nextConfig;
