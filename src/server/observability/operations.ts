import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/server/auth/current-user";
import { ServiceError } from "@/server/services/service-error";
import { databaseHealth, ageSeconds, backlogStatus } from "./health";
import { observabilityConfig } from "@/lib/observability/config";
import { recordIncident } from "./incident";
export async function requireOperationsActor() {
  const actor = await getCurrentUser();
  if (!actor)
    throw new ServiceError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Staff sign-in required.",
    );
  if (actor.role !== "SUPER_ADMIN")
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "Platform operations access is required.",
    );
  return actor;
}
export async function operationalSnapshot() {
  const now = new Date(),
    since = new Date(now.getTime() - 15 * 60000),
    config = observabilityConfig();
  const database = await databaseHealth();
  if (database.status === "UNHEALTHY")
    return {
      status: "UNHEALTHY" as const,
      checkedAt: now.toISOString(),
      environment: config.environment,
      release: config.release ?? null,
      database,
      dependencies: "UNKNOWN" as const,
      data: null,
    };
  const data = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
      const [
        webhooks,
        pending,
        failed,
        oldest,
        retries,
        refunds,
        stuckRefunds,
        jobs,
        incidents,
        cancellationPending,
      ] = await Promise.all([
        tx.paymentWebhookEvent.groupBy({
          by: ["status"],
          where: {
            provider: { not: "sandbox-internal" },
            receivedAt: { gte: since },
          },
          _count: true,
        }),
        tx.notificationOutbox.count({ where: { status: "PENDING" } }),
        tx.notificationOutbox.count({ where: { status: "FAILED" } }),
        tx.notificationOutbox.findFirst({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        tx.notificationOutbox.count({
          where: { status: "PENDING", attemptCount: { gt: 0 } },
        }),
        tx.refund.findMany({
          where: { status: "FAILED", retry: { is: null } },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            id: true,
            orderId: true,
            status: true,
            updatedAt: true,
            order: {
              select: {
                publicOrderCode: true,
                organizationId: true,
                locationId: true,
              },
            },
          },
        }),
        // createdAt, not updatedAt: the recovery sweep deliberately rotates updatedAt.
        tx.refund.count({
          where: {
            status: { in: ["PENDING", "PROCESSING"] },
            createdAt: {
              lt: new Date(now.getTime() - config.stuckSeconds * 1000),
            },
          },
        }),
        tx.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
        tx.operationalIncident.findMany({
          orderBy: { lastSeenAt: "desc" },
          take: 20,
          select: {
            id: true,
            domain: true,
            errorCode: true,
            status: true,
            requestId: true,
            jobRunId: true,
            occurrences: true,
            lastSeenAt: true,
          },
        }),
        tx.paymentWebhookEvent.count({
          where: { provider: "sandbox-internal", status: "CANCEL_PENDING" },
        }),
      ]);
      const allRefundFailures = await tx.refund.count({
        where: { status: "FAILED", retry: { is: null } },
      });
      const jobHealth = await Promise.all(
        ["NOTIFICATIONS", "PAYMENT_RECOVERY", "OPERATIONS_MONITOR"].map(
          async (jobType) => {
            const [latest, success, failure] = await Promise.all([
              tx.jobRun.findFirst({
                where: { jobType },
                orderBy: { startedAt: "desc" },
              }),
              tx.jobRun.findFirst({
                where: { jobType, status: "SUCCEEDED" },
                orderBy: { startedAt: "desc" },
                select: { completedAt: true },
              }),
              tx.jobRun.findFirst({
                where: { jobType, status: { in: ["PARTIAL", "FAILED"] } },
                orderBy: { startedAt: "desc" },
                select: { completedAt: true },
              }),
            ]);
            const stale = Boolean(
              latest &&
              ageSeconds(latest.startedAt, now)! > config.jobStaleSeconds,
            );
            return {
              jobType,
              status: !latest
                ? "UNKNOWN"
                : stale ||
                    latest.status === "FAILED" ||
                    latest.status === "PARTIAL"
                  ? "DEGRADED"
                  : "HEALTHY",
              lastSuccessAt: success?.completedAt?.toISOString() ?? null,
              lastFailedAt: failure?.completedAt?.toISOString() ?? null,
              lastStartedAt: latest?.startedAt.toISOString() ?? null,
              processedCount: latest?.processedCount ?? 0,
              failedCount: latest?.failedCount ?? 0,
              durationMs: latest?.durationMs ?? null,
            };
          },
        ),
      );
      return {
        webhooks: webhooks.map((row) => ({
          status: row.status,
          count: row._count,
        })),
        outbox: {
          pending,
          failed,
          retrying: retries,
          oldestSeconds: ageSeconds(oldest?.createdAt, now),
          status: backlogStatus(
            pending,
            ageSeconds(oldest?.createdAt, now),
            failed,
          ),
        },
        refunds: {
          failed: allRefundFailures,
          stuck: stuckRefunds,
          rows: refunds.map((row) => ({
            id: row.id,
            orderId: row.orderId,
            publicOrderCode: row.order.publicOrderCode,
            organizationId: row.order.organizationId,
            locationId: row.order.locationId,
            status: row.status,
            updatedAt: row.updatedAt.toISOString(),
          })),
        },
        jobs: jobs.map((row) => ({
          id: row.id,
          jobType: row.jobType,
          status: row.status,
          startedAt: row.startedAt.toISOString(),
          completedAt: row.completedAt?.toISOString() ?? null,
          durationMs: row.durationMs,
          processedCount: row.processedCount,
          failedCount: row.failedCount,
          safeErrorCode: row.safeErrorCode,
          environment: row.environment,
          release: row.release,
          stale:
            row.status === "RUNNING" &&
            ageSeconds(row.startedAt, now)! > config.stuckSeconds,
        })),
        incidents: incidents.map((row) => ({
          ...row,
          lastSeenAt: row.lastSeenAt.toISOString(),
        })),
        cancellationPending,
        jobHealth,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 6000, maxWait: 1000 },
  );
  const lastJobs = data.jobHealth.filter(
    (job) => job.jobType !== "OPERATIONS_MONITOR",
  );
  const missingJob = lastJobs.some((job) => job.status === "UNKNOWN"),
    degradedJob = lastJobs.some((job) => job.status === "DEGRADED");
  const degraded =
    database.status === "DEGRADED" ||
    data.outbox.status === "DEGRADED" ||
    data.refunds.failed > 0 ||
    data.refunds.stuck > 0 ||
    data.cancellationPending > 0 ||
    degradedJob ||
    data.webhooks.some((w) =>
      ["REJECTED", "REVIEW", "FAILED", "PENDING"].includes(w.status),
    );
  return {
    status: degraded
      ? ("DEGRADED" as const)
      : missingJob
        ? ("UNKNOWN" as const)
        : ("HEALTHY" as const),
    checkedAt: now.toISOString(),
    environment: config.environment,
    release: config.release ?? null,
    database,
    dependencies: "UNKNOWN" as const,
    data,
  };
}
export async function getOperations() {
  await requireOperationsActor();
  return operationalSnapshot();
}
export async function refreshOperationalIncidents() {
  const health = await operationalSnapshot();
  await recordIncident(
    "database",
    "DATABASE_UNAVAILABLE",
    health.database.status === "UNHEALTHY",
  );
  if (!health.data) return health;
  await recordIncident(
    "notifications",
    "OUTBOX_BACKLOG",
    health.data.outbox.status === "DEGRADED",
  );
  await recordIncident(
    "refunds",
    "REFUND_ATTENTION_REQUIRED",
    health.data.refunds.failed > 0 || health.data.refunds.stuck > 0,
  );
  await recordIncident(
    "webhooks",
    "WEBHOOK_ATTENTION_REQUIRED",
    health.data.webhooks.some((row) =>
      ["REJECTED", "REVIEW", "FAILED", "PENDING"].includes(row.status),
    ) || health.data.cancellationPending > 0,
  );
  for (const type of ["NOTIFICATIONS", "PAYMENT_RECOVERY"]) {
    const job = health.data.jobHealth.find((row) => row.jobType === type);
    await recordIncident(
      "processor." + type,
      "PROCESSOR_STALE",
      !job || job.status === "UNKNOWN" || job.status === "DEGRADED",
    );
  }
  return health;
}

/** Only terminal operational telemetry; no business/audit/outbox history is touched. */
export async function pruneOperationalTelemetry(now = new Date()) {
  // Ephemeral keyed counters only; do not retain anonymous network history.
  await prisma.$executeRaw`DELETE FROM security_rate_limits WHERE key IN
    (SELECT key FROM security_rate_limits WHERE "expiresAt" < ${now} ORDER BY "expiresAt" LIMIT 1000)`;
  const before = new Date(now.getTime() - 30 * 86400000);
  const [jobs, incidents] = await Promise.all([
    prisma.jobRun.findMany({
      where: { status: { not: "RUNNING" }, startedAt: { lt: before } },
      orderBy: { startedAt: "asc" },
      take: 1000,
      select: { id: true },
    }),
    prisma.operationalIncident.findMany({
      where: { status: "RESOLVED", lastSeenAt: { lt: before } },
      orderBy: { lastSeenAt: "asc" },
      take: 1000,
      select: { id: true },
    }),
  ]);
  return {
    jobs: (
      await prisma.jobRun.deleteMany({
        where: {
          id: { in: jobs.map((row) => row.id) },
          status: { not: "RUNNING" },
          startedAt: { lt: before },
        },
      })
    ).count,
    incidents: (
      await prisma.operationalIncident.deleteMany({
        where: {
          id: { in: incidents.map((row) => row.id) },
          status: "RESOLVED",
          lastSeenAt: { lt: before },
        },
      })
    ).count,
  };
}
