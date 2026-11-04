// Typed client for /api/v1. Plain TypeScript (no react-native imports) so it can be unit tested.
import type {
  ApiErrorCode,
  AppointmentStatus,
  BreakKind,
  ClientErrorCode,
  ClockActionResponse,
  ClockStatus,
  CreateTimeOffResponse,
  MessageResponse,
  NotificationSettings,
  Me,
  TimeOffDecision,
  TimeOffInput,
  TimeOffResponse,
  TimeOffScope,
  TodayResponse,
  TodayScope,
} from "./types";

export const WORKSPACE_HEADER = "x-juniper-workspace";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode | ClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Text that is safe to show a person for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong. Try again.";
}

export interface ApiDeps {
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
  getWorkspaceId: () => string | null | Promise<string | null>;
  /** Called once when the server answers 401. The app clears its session here. */
  onUnauthorized: () => void | Promise<void>;
  fetchImpl?: typeof fetch;
}

interface RequestOptions {
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

export function createApi(deps: ApiDeps) {
  const base = deps.baseUrl.replace(/\/+$/, "");

  async function request<T>(method: "GET" | "POST", path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = await deps.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const workspaceId = await deps.getWorkspaceId();
    if (workspaceId) headers[WORKSPACE_HEADER] = workspaceId;
    // The API requires JSON on every write, even when there is nothing to send.
    if (method !== "GET") headers["Content-Type"] = "application/json";

    const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : "";
    let res: Response;
    try {
      res = await (deps.fetchImpl ?? fetch)(`${base}/api/v1${path}${qs}`, {
        method,
        headers,
        body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
      });
    } catch {
      throw new ApiError(0, "network", "Can't reach Juniper. Check your connection and try again.");
    }

    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // Not JSON; handled below.
    }
    const env = json as { data?: T; error?: { code?: ApiErrorCode; message?: string } } | null;

    if (res.status === 401) {
      await deps.onUnauthorized();
      throw new ApiError(401, "unauthorized", env?.error?.message ?? "Sign in to continue.");
    }
    if (!res.ok || env?.error) {
      throw new ApiError(res.status, env?.error?.code ?? "server_error", env?.error?.message ?? "Something went wrong. Try again.");
    }
    if (!env || !("data" in env)) throw new ApiError(res.status, "bad_response", "Juniper sent a reply the app could not read. Try again.");
    return env.data as T;
  }

  return {
    me: () => request<Me>("GET", "/me"),
    switchWorkspace: (workspaceId: string) => request<Me>("POST", "/me/workspace", { body: { workspaceId } }),
    today: (scope: TodayScope) => request<TodayResponse>("GET", "/appointments/today", { query: { scope } }),
    setAppointmentStatus: (id: string, status: AppointmentStatus) =>
      request<MessageResponse>("POST", `/appointments/${encodeURIComponent(id)}/status`, { body: { status } }),
    clock: () => request<ClockStatus>("GET", "/clock"),
    clockIn: () => request<ClockActionResponse>("POST", "/clock/in"),
    clockOut: () => request<ClockActionResponse>("POST", "/clock/out"),
    startBreak: (kind: BreakKind) => request<ClockActionResponse>("POST", "/clock/breaks/start", { body: { kind } }),
    endBreak: () => request<ClockActionResponse>("POST", "/clock/breaks/end"),
    timeOff: (scope: TimeOffScope) => request<TimeOffResponse>("GET", "/time-off", { query: { scope } }),
    requestTimeOff: (input: TimeOffInput) => request<CreateTimeOffResponse>("POST", "/time-off", { body: { ...input } }),
    reviewTimeOff: (id: string, decision: TimeOffDecision, note?: string) =>
      request<MessageResponse>("POST", `/time-off/${encodeURIComponent(id)}/review`, { body: note ? { decision, note } : { decision } }),
    registerDevice: (reg: { token: string; platform: "ios" | "android" }) => request<MessageResponse>("POST", "/devices", { body: { ...reg } }),
    removeDevice: (token: string) => request<MessageResponse>("POST", "/devices/remove", { body: { token } }),
    notificationSettings: () => request<NotificationSettings>("GET", "/notifications"),
    setNotificationSettings: (change: Partial<NotificationSettings>) => request<NotificationSettings>("POST", "/notifications", { body: { ...change } }),
    cancelTimeOff: (id: string) => request<MessageResponse>("POST", `/time-off/${encodeURIComponent(id)}/cancel`),
  };
}

export type Api = ReturnType<typeof createApi>;
