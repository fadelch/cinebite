export const POLL_INTERVAL_MS = 5000;
/** Small jitter prevents synchronized cinema devices; failed polls back off. */
export function pollingDelay(
  failures: number,
  random = Math.random(),
  retryAfterMs = 0,
) {
  const base = Math.min(
    30000,
    POLL_INTERVAL_MS * 2 ** Math.min(Math.max(0, failures), 3),
  );
  return Math.max(
    retryAfterMs,
    Math.round(base * (0.9 + Math.min(1, Math.max(0, random)) * 0.2)),
  );
}
