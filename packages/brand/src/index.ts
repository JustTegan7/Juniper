// Juniper One brand tokens. One source for the web app and the future phone app.
// apps/web/app/globals.css mirrors these; a test in apps/web checks they match.

export const palette = {
  berry: "#3E4C78",
  frost: "#C9D3EA",
  needle: "#4F7A62",
  mist: "#EEF0F6",
  ink: "#141A2B",
  white: "#FFFFFF",
  clay: "#C8643C",
  sun: "#E8B33A",
} as const;

export const tokens = {
  light: {
    bg: "#F6F7FB",
    surface: "#FFFFFF",
    surface2: palette.mist,
    border: "#DCE0EC",
    fg: palette.ink,
    muted: "#596079",
    primary: palette.berry,
    primaryFg: "#FFFFFF",
    accent: palette.frost,
    accentFg: palette.berry,
    mark: palette.frost,
    overdue: palette.clay,
    today: "#B9831A",
  },
  dark: {
    bg: "#10141F",
    surface: "#171C2B",
    surface2: "#1F2638",
    border: "#2C3550",
    fg: "#E8EBF4",
    muted: "#9AA3BE",
    primary: "#A9B8EE",
    primaryFg: palette.ink,
    accent: palette.frost,
    accentFg: palette.berry,
    mark: "rgba(169, 184, 238, 0.35)",
    overdue: "#E58A63",
    today: palette.sun,
  },
  radius: { sm: "8px", md: "12px", lg: "18px", pill: "999px" },
  fonts: { display: "Bricolage Grotesque", body: "Figtree" },
} as const;

/** Juniper One mark: a sprig with three berries (viewBox 0 0 1024 1024). */
export const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="228" fill="${palette.berry}"/><path d="M512 860V420M512 560l-150-120M512 500l150-130" stroke="#8FBFA2" stroke-width="44" stroke-linecap="round" fill="none"/><circle cx="512" cy="300" r="110" fill="${palette.frost}"/><circle cx="340" cy="400" r="84" fill="${palette.frost}" opacity=".85"/><circle cx="690" cy="340" r="84" fill="${palette.frost}" opacity=".85"/></svg>`;
