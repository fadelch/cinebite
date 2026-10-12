"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  POLL_INTERVAL_MS,
  pollingDelay,
} from "@/lib/performance/polling-policy";

export const ORDER_POLL_INTERVAL_MS = POLL_INTERVAL_MS;

/** One in-flight request, no cache, hidden-tab pause, and stale-response protection. */
export function usePolling<T>(endpoint: string, initialData: T) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  const denied = useRef(false);
  const failures = useRef(0),
    retryAfter = useRef(0);
  const etag = useRef<{ endpoint: string; value: string } | null>(null);

  const refresh = useCallback(async () => {
    if (denied.current || document.visibilityState === "hidden") return;
    if (active.current && !active.current.signal.aborted) return;
    const controller = new AbortController();
    active.current = controller;
    const requestSequence = ++sequence.current;
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        signal: controller.signal,
        headers:
          etag.current?.endpoint === endpoint
            ? { "If-None-Match": etag.current.value }
            : {},
      });
      if (requestSequence !== sequence.current) return;
      if (response.status === 304) {
        failures.current = 0;
        retryAfter.current = 0;
        setError(null);
        return;
      }
      const body = await response.json();
      if (requestSequence !== sequence.current) return;
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) denied.current = true;
        const seconds = Number(response.headers.get("Retry-After"));
        retryAfter.current =
          Number.isFinite(seconds) && seconds > 0 && seconds <= 300
            ? seconds * 1000
            : 0;
        throw new Error(body.error || "Updates are temporarily unavailable.");
      }
      const value = response.headers.get("ETag");
      etag.current = value ? { endpoint, value } : null;
      failures.current = 0;
      retryAfter.current = 0;
      setData(body as T);
      setError(null);
    } catch (failure) {
      if (!controller.signal.aborted && requestSequence === sequence.current) {
        failures.current++;
        setError(
          failure instanceof Error
            ? failure.message
            : "Updates are temporarily unavailable.",
        );
      }
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [endpoint]);

  useEffect(() => {
    const requestSequenceRef = sequence;
    let stopped = false;
    let ticking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    denied.current = false;
    failures.current = 0;
    retryAfter.current = 0;
    etag.current = null;
    async function tick() {
      if (stopped || ticking) return;
      ticking = true;
      try {
        await refresh();
      } finally {
        ticking = false;
      }
      if (
        !stopped &&
        !denied.current &&
        document.visibilityState !== "hidden"
      ) {
        clearTimeout(timer);
        timer = setTimeout(
          tick,
          pollingDelay(failures.current, Math.random(), retryAfter.current),
        );
      }
    }
    void tick();
    function onVisible() {
      clearTimeout(timer);
      if (document.visibilityState === "visible" && !denied.current)
        void tick();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      active.current?.abort();
      ++requestSequenceRef.current;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  return { data, error, refresh };
}
