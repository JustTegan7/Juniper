// Juniper brand tokens. One source for the web app and the future phone app.
// apps/web/app/globals.css mirrors these; a test in apps/web checks they match.

export const palette = {
  deep: "#1F3D36",
  sage: "#6F8F7F",
  berry: "#4F5D95",
  frost: "#C9D2EA",
  clay: "#D9825B",
  cream: "#F7F4EE",
  ink: "#1B2421",
  white: "#FFFFFF",
} as const;

export const tokens = {
  light: {
    bg: palette.cream,
    surface: "#FFFFFF",
    surface2: "#EFEBE2",
    border: "#E3DFD5",
    fg: palette.ink,
    muted: "#5B6862",
    primary: palette.deep,
    primaryFg: "#FFFFFF",
    accent: palette.frost,
    accentFg: "#3A4678",
    mark: palette.frost,
    overdue: "#A94442",
    today: "#C0643C",
    sage: palette.sage,
    berry: palette.berry,
    confirmed: "#2F6B4F",
    pending: "#B7791F",
    cancelled: "#A94442",
  },
  dark: {
    bg: "#0F1815",
    surface: "#16221E",
    surface2: "#1E2D28",
    border: "#2B3D37",
    fg: "#EDEAE2",
    muted: "#9DB0A7",
    primary: "#9DB8A9",
    primaryFg: "#0F1815",
    accent: palette.frost,
    accentFg: "#3A4678",
    mark: "rgba(157, 184, 169, 0.35)",
    overdue: "#E58A84",
    today: "#E8A27C",
    sage: "#9DB8A9",
    berry: palette.frost,
    confirmed: "#6FBF9A",
    pending: "#E3B25A",
    cancelled: "#E58A84",
  },
  radius: { sm: "8px", md: "12px", lg: "20px", pill: "999px" },
  fonts: { display: "Fraunces", body: "DM Sans" },
} as const;

/** Juniper app icon: cream J with a sage leaf and a frost berry on deep green (viewBox 0 0 100 100). */
export const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="${palette.deep}"/><g transform="translate(8 8) scale(0.84)"><path d="M62 22 V58 C62 71 53 80 41 80 C32 80 26 76 22 70" fill="none" stroke="${palette.cream}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M62 22 C61 11 70 5 83 6 C84 18 76 26 62 22 Z" fill="#9DB8A9"/><circle cx="35" cy="52" r="9.5" fill="${palette.frost}"/></g></svg>`;
