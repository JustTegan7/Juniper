import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errorMessage } from "./api";

type Mode = "first" | "pull" | "quiet";

/**
 * Loads data for a screen: first load, pull to refresh and an error message. Ignores answers that arrive after a newer call.
 *
 * It also refreshes quietly (no spinner) each time the screen comes back into focus. The first focus is skipped because the
 * mount load already covers it, so a screen fetches once when it opens, not twice. Pass `refreshOnFocus: false` to turn that off.
 */
export function useLoad<T>(fetcher: () => Promise<T>, deps: unknown[], opts: { refreshOnFocus?: boolean } = {}) {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const callId = useRef(0);

  const run = useCallback(
    async (mode: Mode) => {
      const id = ++callId.current;
      if (mode === "pull") setRefreshing(true);
      else if (mode === "first") setLoading(true);
      try {
        const next = await fetcher();
        if (id !== callId.current) return;
        setDataState(next);
        setError(null);
      } catch (e) {
        if (id !== callId.current) return;
        // A 401 already signed the person out; no message needed.
        if (!(e instanceof ApiError && e.code === "unauthorized")) setError(errorMessage(e));
      } finally {
        if (id === callId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  // Load on mount and whenever deps change (a new tab filter, another business).
  useEffect(() => {
    void run("first");
  }, [run]);

  // Quiet refresh when the screen is focused again. Reads the latest `run` from a ref so a dep change never causes a second fetch.
  const runRef = useRef(run);
  runRef.current = run;
  const firstFocus = useRef(true);
  const refreshOnFocus = opts.refreshOnFocus ?? true;
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (refreshOnFocus) void runRef.current("quiet");
    }, [refreshOnFocus]),
  );

  /** Replace the data with an answer a write already returned. Any load still in flight is ignored, so it cannot overwrite it. */
  const setData = useCallback((next: T) => {
    callId.current++;
    setDataState(next);
    setError(null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  return {
    data,
    error,
    loading,
    refreshing,
    /** Load again with the spinner (used by retry). */
    reload: () => run("first"),
    /** Load again with no spinner, to match the server after a write. */
    sync: () => run("quiet"),
    pull: () => run("pull"),
    setData,
    setError,
  };
}
