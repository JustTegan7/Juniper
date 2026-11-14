import { describe, expect, it, vi } from "vitest";
import { normalizeOrigin } from "@evergreen/core";

vi.mock("server-only", () => ({}));
const { corsFor } = await import("./shop-api");

describe("normalizeOrigin", () => {
  it("keeps only the origin and requires https", () => {
    expect(normalizeOrigin("https://Shop.Example.com/path?x=1")).toBe("https://shop.example.com");
    expect(normalizeOrigin("http://example.com")).toBeNull();
    expect(normalizeOrigin("http://localhost:3000/a")).toBe("http://localhost:3000");
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("not a url")).toBeNull();
  });
});

describe("corsFor", () => {
  const allowed = ["https://reloved.example.com", "https://www.reloved.example.com/"];
  it("allows listed origins and echoes them back", () => {
    const r = corsFor(allowed, "https://www.reloved.example.com");
    expect(r.ok).toBe(true);
    expect(r.headers["Access-Control-Allow-Origin"]).toBe("https://www.reloved.example.com");
  });
  it("refuses unlisted, lookalike and non-https origins", () => {
    for (const o of ["https://evil.example.com", "https://reloved.example.com.evil.com", "http://reloved.example.com", "null"]) {
      const r = corsFor(allowed, o);
      expect(r.ok).toBe(false);
      expect(r.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    }
  });
  it("allows server to server calls with no Origin and never sets a wildcard", () => {
    const r = corsFor([], null);
    expect(r.ok).toBe(true);
    expect(r.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(corsFor(allowed, "https://reloved.example.com").headers["Access-Control-Allow-Origin"]).not.toBe("*");
  });
});
