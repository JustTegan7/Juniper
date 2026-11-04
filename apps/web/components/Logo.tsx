import { siteConfig } from "../lib/site-config";

/** Juniper mark: a J with a leaf on top and a berry in the curve. Colors follow the light and dark theme. */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <path d="M62 22 V58 C62 71 53 80 41 80 C32 80 26 76 22 70" fill="none" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--logo-stem)" }} />
      <path d="M62 22 C61 11 70 5 83 6 C84 18 76 26 62 22 Z" style={{ fill: "var(--logo-leaf)" }} />
      <circle cx="35" cy="52" r="9.5" style={{ fill: "var(--logo-berry)" }} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={size} />
      <span className="font-display text-2xl font-semibold lowercase tracking-tight">{siteConfig.businessName}</span>
    </span>
  );
}
