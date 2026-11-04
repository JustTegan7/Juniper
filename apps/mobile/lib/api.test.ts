import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi, errorMessage, WORKSPACE_HEADER } from "./api";

type Call = { url: string; init: RequestInit };

function setup(reply: () => Response | Promise<Response>, deps: { token?: string | null; workspaceId?: string | null } = {}) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return reply();
  }) as unknown as typeof fetch;
  const onUnauthorized = vi.fn();
  const api = createApi({
    baseUrl: "https://api.example.test/",
    getToken: () => (deps.token === undefined ? "signed.token" : deps.token),
    getWorkspaceId: () => (deps.workspaceId === undefined ? "ws-1" : deps.workspaceId),
    onUnauthorized,
    fetchImpl,
  });
  return { api, calls, onUnauthorized };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const headersOf = (c: Call) => c.init.headers as Record<string, string>;

describe("headers", () => {
  it("sends the bearer token and the workspace header", async () => {
    const { api, calls } = setup(() => json({ data: { ok: true } }));
    await api.me();
    expect(calls[0].url).toBe("https://api.example.test/api/v1/me");
    expect(headersOf(calls[0]).Authorization).toBe("Bearer signed.token");
    expect(headersOf(calls[0])[WORKSPACE_HEADER]).toBe("ws-1");
  });

  it("leaves out the workspace header before a business is picked", async () => {
    const { api, calls } = setup(() => json({ data: {} }), { workspaceId: null });
    await api.me();
    expect(headersOf(calls[0])[WORKSPACE_HEADER]).toBeUndefined();
  });

  it("leaves out Authorization when there is no token", async () => {
    const { api, calls } = setup(() => json({ data: {} }), { token: null });
    await api.me();
    expect(headersOf(calls[0]).Authorization).toBeUndefined();
  });

  it("sends Content-Type application/json on writes, with a JSON body, and not on reads", async () => {
    const { api, calls } = setup(() => json({ data: { message: "ok" } }));
    await api.today("all");
    await api.setAppointmentStatus("a/1", "checked_in");
    expect(headersOf(calls[0])["Content-Type"]).toBeUndefined();
    expect(calls[0].url).toBe("https://api.example.test/api/v1/appointments/today?scope=all");
    expect(headersOf(calls[1])["Content-Type"]).toBe("application/json");
    expect(calls[1].init.method).toBe("POST");
    expect(calls[1].url).toBe("https://api.example.test/api/v1/appointments/a%2F1/status");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ status: "checked_in" });
  });

  it("sends the id when switching business", async () => {
    const { api, calls } = setup(() => json({ data: {} }));
    await api.switchWorkspace("ws-2");
    expect(calls[0].url).toBe("https://api.example.test/api/v1/me/workspace");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ workspaceId: "ws-2" });
  });
});

describe("responses", () => {
  it("returns the data of a success", async () => {
    const { api } = setup(() => json({ data: { clockedIn: false, entry: null, breaks: [], openBreak: null } }));
    await expect(api.clock()).resolves.toEqual({ clockedIn: false, entry: null, breaks: [], openBreak: null });
  });

  it("turns an error body into an ApiError with the server's code and message", async () => {
    const { api, onUnauthorized } = setup(() => json({ error: { code: "conflict", message: "That time was just taken." } }, 409));
    const err = await api.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "conflict", message: "That time was just taken." });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("keeps the no_workspace code so the app can show its friendly screen", async () => {
    const { api } = setup(() => json({ error: { code: "no_workspace", message: "You are not on a team yet." } }, 403));
    await expect(api.me()).rejects.toMatchObject({ status: 403, code: "no_workspace" });
  });

  it("uses a safe message when an error reply is not JSON", async () => {
    const { api } = setup(() => new Response("<html>bad gateway</html>", { status: 502 }));
    const err = await api.me().catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, code: "server_error", message: "Something went wrong. Try again." });
  });

  it("reports a reply it cannot read", async () => {
    const { api } = setup(() => json({ unexpected: true }));
    await expect(api.me()).rejects.toMatchObject({ code: "bad_response" });
  });

  it("reports a network failure with a friendly message", async () => {
    const calls: Call[] = [];
    const api = createApi({
      baseUrl: "https://api.example.test",
      getToken: () => "t",
      getWorkspaceId: () => null,
      onUnauthorized: () => {},
      fetchImpl: (async () => {
        calls.push({ url: "", init: {} });
        throw new TypeError("Network request failed");
      }) as unknown as typeof fetch,
    });
    const err = await api.me().catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 0, code: "network" });
    expect(errorMessage(err)).toContain("Can't reach Juniper");
  });
});

describe("401", () => {
  it("signs the person out once and still throws", async () => {
    const { api, onUnauthorized } = setup(() => json({ error: { code: "unauthorized", message: "Sign in to continue." } }, 401));
    await expect(api.today("mine")).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("signs out on a 401 even when the body is empty", async () => {
    const { api, onUnauthorized } = setup(() => new Response(null, { status: 401 }));
    await expect(api.me()).rejects.toMatchObject({ code: "unauthorized", message: "Sign in to continue." });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("waits for the sign out to finish before throwing", async () => {
    const order: string[] = [];
    const api = createApi({
      baseUrl: "https://api.example.test",
      getToken: () => "t",
      getWorkspaceId: () => null,
      onUnauthorized: async () => {
        await Promise.resolve();
        order.push("signed-out");
      },
      fetchImpl: (async () => new Response(null, { status: 401 })) as unknown as typeof fetch,
    });
    await api.me().catch(() => order.push("thrown"));
    expect(order).toEqual(["signed-out", "thrown"]);
  });
});

describe("errorMessage", () => {
  it("shows the server message for API errors and a generic one otherwise", () => {
    expect(errorMessage(new ApiError(400, "invalid", "Pick a later time."))).toBe("Pick a later time.");
    expect(errorMessage(new Error("TypeError: undefined is not a function"))).toBe("Something went wrong. Try again.");
  });
});
