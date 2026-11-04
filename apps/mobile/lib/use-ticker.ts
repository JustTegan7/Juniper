import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";

/** True while this screen is the one being looked at. */
export function useFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}

/** The current time, updated every second while `enabled` and the screen is focused. Stops completely otherwise. */
export function useTicker(enabled: boolean): Date {
  const focused = useFocused();
  const [now, setNow] = useState(() => new Date());
  const running = enabled && focused;
  useEffect(() => {
    if (!running) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return now;
}
