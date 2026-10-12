import "server-only";
function bounded(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}
export function observabilityConfig() {
  const environment =
    process.env.OBSERVABILITY_ENVIRONMENT ??
    process.env.NODE_ENV ??
    "development";
  const release =
    process.env.OBSERVABILITY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA;
  return {
    environment: ["test", "development", "staging", "production"].includes(
      environment,
    )
      ? environment
      : "production",
    release:
      release && /^[a-zA-Z0-9_.-]{1,80}$/.test(release) ? release : undefined,
    debug:
      process.env.NODE_ENV !== "production" &&
      process.env.OBSERVABILITY_LOG_LEVEL === "debug",
    slowRequestMs: bounded("OBSERVABILITY_SLOW_REQUEST_MS", 2000, 10, 60000),
    dbDegradedMs: bounded("OBSERVABILITY_DB_DEGRADED_MS", 500, 10, 10000),
    backlogSeconds: bounded("OBSERVABILITY_BACKLOG_SECONDS", 120, 1, 86400),
    stuckSeconds: bounded("OBSERVABILITY_STUCK_SECONDS", 900, 5, 86400),
    jobStaleSeconds: bounded("OBSERVABILITY_JOB_STALE_SECONDS", 300, 5, 86400),
  };
}
