import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errorMessage } from "./api";

/** Loads data for a screen: first load, pull to refresh and an error message. Ignores answers that arrive after a newer call. */
export function useLoad<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const callId = useRef(0);

  const run = useCallback(
    async (pull: boolean) => {
      const id = ++callId.current;
      if (pull) setRefreshing(true);
      else setLoading(true);
      try {
        const next = await fetcher();
        if (id !== callId.current) return;
        setData(next);
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

  useEffect(() => {
    void run(false);
  }, [run]);

  return { data, error, loading, refreshing, reload: () => run(false), pull: () => run(true), setError };
}
