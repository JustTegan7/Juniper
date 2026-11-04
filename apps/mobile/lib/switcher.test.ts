import { describe, expect, it } from "vitest";
import { canSwitch, otherBusinesses, resolveWorkspace } from "./switcher";

const a = { id: "a", name: "Barclay's Salon" };
const b = { id: "b", name: "Second Chair" };

describe("resolveWorkspace", () => {
  it("has nothing to open when the person is on no business", () => {
    expect(resolveWorkspace([], null, null)).toEqual({ kind: "none" });
    expect(resolveWorkspace([], "a", null)).toEqual({ kind: "none" });
  });

  it("uses the only business without asking", () => {
    expect(resolveWorkspace([a], null, "a")).toEqual({ kind: "use", id: "a", switchNeeded: false });
  });

  it("asks when there are several businesses and none is saved", () => {
    expect(resolveWorkspace([a, b], null, "a")).toEqual({ kind: "choose" });
  });

  it("uses the saved business when it is still one of theirs", () => {
    expect(resolveWorkspace([a, b], "b", "b")).toEqual({ kind: "use", id: "b", switchNeeded: false });
  });

  it("asks for a switch call when the server picked a different business than the saved one", () => {
    expect(resolveWorkspace([a, b], "b", "a")).toEqual({ kind: "use", id: "b", switchNeeded: true });
  });

  it("ignores a saved business they are no longer on", () => {
    expect(resolveWorkspace([a, b], "gone", "a")).toEqual({ kind: "choose" });
    expect(resolveWorkspace([a], "gone", "a")).toEqual({ kind: "use", id: "a", switchNeeded: false });
  });
});

describe("switcher lists", () => {
  it("offers switching only with more than one business", () => {
    expect(canSwitch([])).toBe(false);
    expect(canSwitch([a])).toBe(false);
    expect(canSwitch([a, b])).toBe(true);
  });

  it("lists the other businesses in the server's order", () => {
    expect(otherBusinesses([a, b], "a")).toEqual([b]);
    expect(otherBusinesses([a, b], null)).toEqual([a, b]);
  });
});
