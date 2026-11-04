import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: () => ({}) }));

const { auth, MOBILE_SCHEME } = await import("./auth");

describe("auth config for the phone app", () => {
  it("has the Expo and bearer plugins, with signed bearer tokens only", () => {
    const plugins = auth().options.plugins ?? [];
    const ids = plugins.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["expo", "bearer", "magic-link"]));
    const bearer = plugins.find((p) => p.id === "bearer") as { options?: { requireSignature?: boolean } };
    expect(bearer.options?.requireSignature).toBe(true);
  });

  it("trusts the app's URL scheme", () => {
    expect(MOBILE_SCHEME).toBe("juniper");
    expect(auth().options.trustedOrigins).toEqual(expect.arrayContaining(["juniper://"]));
  });

  it("keeps staff email and password sign-in on", () => {
    expect(auth().options.emailAndPassword?.enabled).toBe(true);
  });
});
