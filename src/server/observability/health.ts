import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env.server";
import { observabilityConfig } from "@/lib/observability/config";
import { log } from "@/lib/observability/logger";
export type HealthStatus = "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
export async function databaseHealth(
  probe: () => Promise<unknown> = async () =>
    prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '1500ms'");
        return tx.$queryRaw`SELECT 1`;
      },
      { timeout: 2000, maxWait: 1000 },
    ),
) {
  const started = performance.now();
  try {
    await probe();
    const latencyMs = Math.round((performance.now() - started) * 100) / 100;
    return {
      status: (latencyMs > observabilityConfig().dbDegradedMs
        ? "DEGRADED"
        : "HEALTHY") as HealthStatus,
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    log("warn", "health.database_unavailable", {
      errorCode: "DATABASE_UNAVAILABLE",
      durationMs: performance.now() - started,
    });
    return {
      status: "UNHEALTHY" as HealthStatus,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
    };
  }
}
export async function readiness() {
  try {
    getServerEnv();
  } catch {
    return false;
  }
  return (await databaseHealth()).status !== "UNHEALTHY";
}
export function ageSeconds(date: Date | null | undefined, now = new Date()) {
  return date
    ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
    : null;
}
export function backlogStatus(
  pending: number,
  oldest: number | null,
  failed: number,
): HealthStatus {
  return failed > 0 ||
    (pending > 0 && (oldest ?? 0) >= observabilityConfig().backlogSeconds)
    ? "DEGRADED"
    : "HEALTHY";
}
