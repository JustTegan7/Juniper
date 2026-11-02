import { palette } from "@evergreen/brand";
import { siteConfig } from "../lib/site-config";

/** Placeholder mark. Swap for the real logo per app. */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" className={className}>
      <rect width="1024" height="1024" rx="228" fill={palette.forest} />
      <path d="M192 600a320 320 0 0 1 640 0z" fill={palette.lime} />
      <rect x="482" y="600" width="60" height="232" rx="30" fill={palette.leaf} />
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
