import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// packages/core must stay framework-free so the iPhone app can share it.
describe("core purity", () => {
  it("never imports next, react or server-only modules", () => {
    const dir = __dirname;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/from\s+["'](next|react|react-dom|server-only)(\/|["'])/);
    }
  });
});
