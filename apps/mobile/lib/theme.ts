import { useColorScheme } from "react-native";
import { tokens } from "@evergreen/brand";

export type Colors = { [K in keyof typeof tokens.light]: string };

const px = (v: string) => Number.parseInt(v, 10);

export const radius = { sm: px(tokens.radius.sm), md: px(tokens.radius.md), lg: px(tokens.radius.lg), pill: px(tokens.radius.pill) };

/** Font family names registered in app/_layout.tsx. Fraunces for headings, DM Sans for everything else. */
export const fonts = {
  display: "Fraunces_600SemiBold",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodyBold: "DMSans_700Bold",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Colors for the current light or dark setting, from the shared brand tokens. */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? tokens.dark : tokens.light;
}
