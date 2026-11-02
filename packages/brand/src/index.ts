// Brand tokens. One source for the web app and the future phone app.
// apps/web/app/globals.css mirrors these; a test in apps/web checks they match.
// These are the starting Evergreen greens. Each app overrides them with its own brand.

export const palette = {
  forest: "#0F3D3A",
  lime: "#B8E066",
  leaf: "#7FC28A",
  sea: "#4FB39C",
  sage: "#EEF2EC",
  ink: "#0B1A18",
  white: "#FFFFFF",
  clay: "#C8643C",
  sun: "#E8B33A",
} as const;

export const tokens = {
  light: {
    bg: "#F6F8F4",
    surface: "#FFFFFF",
    surface2: palette.sage,
    border: "#DCE3D8",
    fg: palette.ink,
    muted: "#55645F",
    primary: palette.forest,
    primaryFg: "#FFFFFF",
    accent: palette.lime,
    accentFg: palette.forest,
    mark: palette.lime,
    overdue: palette.clay,
    today: "#B9831A",
  },
  dark: {
    bg: palette.ink,
    surface: "#12241F",
    surface2: "#18302A",
    border: "#24403A",
    fg: "#E8EFE6",
    muted: "#9AB0A8",
    primary: palette.lime,
    primaryFg: palette.forest,
    accent: palette.lime,
    accentFg: palette.forest,
    mark: "rgba(184, 224, 102, 0.35)",
    overdue: "#E58A63",
    today: palette.sun,
  },
  radius: { sm: "8px", md: "12px", lg: "18px", pill: "999px" },
  fonts: { display: "Bricolage Grotesque", body: "Figtree" },
} as const;

/** Placeholder mark, as SVG markup (viewBox 0 0 1024 1024). Swap for the real logo. */
export const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="228" fill="${palette.forest}"/><path d="M192 600a320 320 0 0 1 640 0z" fill="${palette.lime}"/><rect x="482" y="600" width="60" height="232" rx="30" fill="${palette.leaf}"/></svg>`;
