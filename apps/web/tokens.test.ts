import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tokens } from "@evergreen/brand";

// globals.css must use the exact colors in packages/brand.
describe("brand tokens", () => {
  const css = readFileSync(new URL("./app/globals.css", import.meta.url), "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  const map: Record<string, keyof typeof tokens.light> = {
    "--bg": "bg", "--surface": "surface", "--surface-2": "surface2", "--border": "border", "--fg": "fg", "--muted": "muted",
    "--primary": "primary", "--primary-fg": "primaryFg", "--accent": "accent", "--overdue": "overdue", "--today": "today",
    "--sage": "sage", "--berry": "berry", "--confirmed": "confirmed", "--pending": "pending", "--cancelled": "cancelled",
  };
  for (const [v, k] of Object.entries(map)) {
    it(`${v} matches brand ${k}`, () => {
      const m = root.match(new RegExp(`${v}:\\s*([^;]+);`));
      expect(m?.[1].trim().toLowerCase()).toBe(tokens.light[k].toLowerCase());
    });
  }
});
