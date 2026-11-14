import { describe, expect, it } from "vitest";
import { INDUSTRIES, INDUSTRY_PRESETS, homePath, isRetail, modulesOf, parseSettings, vocabularyFor } from "./business";

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

describe("modules", () => {
  const all = { appointments: true, customers: true, timeclock: true, messages: true, shop: false };
  it("gives appointment businesses everything except the shop by default", () => {
    expect(modulesOf("salon", parseSettings({}))).toEqual(all);
  });
  it("gives retail a store-only default, and an explicit choice wins", () => {
    expect(modulesOf("retail", parseSettings(INDUSTRY_PRESETS.retail.settings))).toEqual({ appointments: false, customers: false, timeclock: true, messages: true, shop: true });
    expect(modulesOf("retail", parseSettings({ shop: { enabled: true }, modules: { customers: true } })).customers).toBe(true);
    expect(modulesOf("retail", parseSettings({})).appointments).toBe(false);
  });
  it("picks a home screen from what is on", () => {
    expect(homePath(all)).toBe("/today");
    expect(homePath({ ...all, appointments: false, shop: true })).toBe("/register");
    expect(homePath({ ...all, appointments: false })).toBe("/clock");
    expect(homePath({ appointments: false, customers: false, timeclock: false, messages: false, shop: false })).toBe("/more");
  });
});
