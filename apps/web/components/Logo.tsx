import { palette } from "@evergreen/brand";
import { siteConfig } from "../lib/site-config";

/** Juniper One mark: a sprig with three berries. */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" className={className}>
      <rect width="1024" height="1024" rx="228" fill={palette.berry} />
      <path d="M512 860V420M512 560l-150-120M512 500l150-130" stroke="#8FBFA2" strokeWidth="44" strokeLinecap="round" fill="none" />
      <circle cx="512" cy="300" r="110" fill={palette.frost} />
      <circle cx="340" cy="400" r="84" fill={palette.frost} opacity=".85" />
      <circle cx="690" cy="340" r="84" fill={palette.frost} opacity=".85" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={size} />
      <span className="font-display text-xl font-extrabold tracking-tight">{siteConfig.businessName}</span>
    </span>
  );
}
