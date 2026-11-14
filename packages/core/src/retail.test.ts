import { describe, expect, it } from "vitest";
import { INDUSTRIES, INDUSTRY_PRESETS, isRetail, parseSettings, vocabularyFor } from "./business";

describe("retail industry", () => {
  it("is offered and recognized, and appointment kinds are not retail", () => {
    expect(INDUSTRIES).toContain("retail");
    expect(isRetail("retail")).toBe(true);
    expect(isRetail("salon")).toBe(false);
    expect(isRetail("nonsense")).toBe(false);
  });

  it("starts with booking off and the shop on, with no sample services", () => {
    const preset = INDUSTRY_PRESETS.retail;
    const s = parseSettings(preset.settings);
    expect(s.booking.enabled).toBe(false);
    expect(s.shop.enabled).toBe(true);
    expect(preset.starterServices).toEqual([]);
    expect(vocabularyFor("retail", {}).clientPlural).toBe("Customers");
  });
});
