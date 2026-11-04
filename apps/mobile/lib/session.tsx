import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createApi, ApiError, errorMessage, type Api } from "./api";
import { authClient, signInWithEmail } from "./auth-client";
import { getApiUrl } from "./config";
import { unregisterThisPhone } from "./notifications";
import { resolveWorkspace } from "./switcher";
import { clearSession, getToken, getWorkspaceId, setWorkspaceId } from "./storage";
import type { BusinessRef, Me } from "./types";

export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "no-workspace" }
  | { status: "choosing"; businesses: BusinessRef[] }
  | { status: "ready"; me: Me }
  | { status: "error"; message: string };

interface SessionValue {
  state: SessionState;
  api: Api;
  /** Returns an error message to show, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Returns an error message to show, or null on success. */
  chooseBusiness: (id: string) => Promise<string | null>;
  refreshMe: () => Promise<void>;
  retry: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}

/** The signed-in /me payload. Only call from screens that render when the session is ready. */
export function useMe(): Me {
  const { state } = useSession();
  if (state.status !== "ready") throw new Error("useMe needs a ready session");
  return state.me;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const unauthorizedRef = useRef<() => void>(() => {});

  const api = useMemo(
    () =>
      createApi({
        baseUrl: getApiUrl() ?? "",
        getToken,
        getWorkspaceId,
        onUnauthorized: () => unauthorizedRef.current(),
      }),
    [],
  );

  // A 401 anywhere signs the person out locally (their session is already gone on the server).
  unauthorizedRef.current = () => {
    void clearSession().then(() => setState({ status: "signed-out" }));
  };

  /** Load /me and settle on a business. */
  const bootstrap = useCallback(async () => {
    if (!getApiUrl()) {
      setState({ status: "error", message: "This build has no server address. Set EXPO_PUBLIC_API_URL and restart the app." });
      return;
    }
    if (!(await getToken())) {
      setState({ status: "signed-out" });
      return;
    }
    try {
      let me: Me;
      try {
        me = await api.me();
      } catch (e) {
        // The saved business is gone (removed from the team): forget it and use the first one.
        if (e instanceof ApiError && e.code === "forbidden") {
          await setWorkspaceId(null);
          me = await api.me();
        } else {
          throw e;
        }
      }
      const choice = resolveWorkspace(me.workspaces, await getWorkspaceId(), me.workspace.id);
      if (choice.kind === "none") return setState({ status: "no-workspace" });
      if (choice.kind === "choose") return setState({ status: "choosing", businesses: me.workspaces });
      if (choice.switchNeeded) me = await api.switchWorkspace(choice.id);
      await setWorkspaceId(choice.id);
      setState({ status: "ready", me });
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthorized") return; // onUnauthorized already moved us to signed-out
      if (e instanceof ApiError && e.code === "no_workspace") return setState({ status: "no-workspace" });
      setState({ status: "error", message: errorMessage(e) });
    }
  }, [api]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const err = await signInWithEmail(email, password);
      if (err) return err;
      setState({ status: "loading" });
      await bootstrap();
      return null;
    },
    [bootstrap],
  );

  const signOut = useCallback(async () => {
    // Stop pushes to this phone first, while the token still works.
    await unregisterThisPhone(api);
    try {
      await authClient.signOut();
    } catch {
      // Offline or already ended: still clear this phone.
    }
    await clearSession();
    setState({ status: "signed-out" });
  }, [api]);

  const chooseBusiness = useCallback(
    async (id: string) => {
      try {
        const me = await api.switchWorkspace(id);
        await setWorkspaceId(id);
        setState({ status: "ready", me });
        return null;
      } catch (e) {
        if (e instanceof ApiError && e.code === "unauthorized") return null;
        return errorMessage(e);
      }
    },
    [api],
  );

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.me();
      setState({ status: "ready", me });
    } catch {
      // Keep showing the last good data; the screen that asked shows its own error.
    }
  }, [api]);

  const retry = useCallback(async () => {
    setState({ status: "loading" });
    await bootstrap();
  }, [bootstrap]);

  const value = useMemo(() => ({ state, api, signIn, signOut, chooseBusiness, refreshMe, retry }), [state, api, signIn, signOut, chooseBusiness, refreshMe, retry]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
