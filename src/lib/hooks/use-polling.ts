"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const ORDER_POLL_INTERVAL_MS = 5000;

/** One in-flight request, no cache, hidden-tab pause, and stale-response protection. */
export function usePolling<T>(endpoint: string, initialData: T) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  const denied = useRef(false);

  const refresh = useCallback(async () => {
    if (denied.current || document.visibilityState === "hidden") return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const requestSequence = ++sequence.current;
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (requestSequence !== sequence.current) return;
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) denied.current = true;
        throw new Error(body.error || "Updates are temporarily unavailable.");
      }
      setData(body as T); setError(null);
    } catch (failure) {
      if (!controller.signal.aborted && requestSequence === sequence.current) {
        setError(failure instanceof Error ? failure.message : "Updates are temporarily unavailable.");
      }
    }
  }, [endpoint]);

  useEffect(() => {
    const requestSequenceRef = sequence;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      await refresh();
      if (!stopped) timer = setTimeout(tick, ORDER_POLL_INTERVAL_MS);
    }
    timer = setTimeout(tick, ORDER_POLL_INTERVAL_MS);
    function onVisible() { if (document.visibilityState === "visible") void refresh(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true; clearTimeout(timer); active.current?.abort(); ++requestSequenceRef.current;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  return { data, error, refresh };
}
