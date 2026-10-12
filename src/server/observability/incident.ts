import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { currentObservation } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";
import { redact } from "@/lib/observability/safe";
export async function recordIncident(
  domain: string,
  errorCode: string,
  unhealthy = true,
) {
  const safe = redact({ domain, errorCode }) as {
    domain?: string;
    errorCode?: string;
  };
  if (!safe.domain || !safe.errorCode) return;
  const key = createHash("sha256")
    .update(safe.domain + ":" + safe.errorCode)
    .digest("hex");
  const now = new Date(),
    context = currentObservation();
  try {
    const transition = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        const existing = await tx.operationalIncident.findUnique({
          where: { key },
        });
        if (!unhealthy) {
          if (existing?.status !== "OPEN") return null;
          await tx.operationalIncident.update({
            where: { key },
            data: { status: "RESOLVED", resolvedAt: now, lastSeenAt: now },
          });
          return "recovered";
        }
        await tx.operationalIncident.upsert({
          where: { key },
          create: {
            key,
            domain: safe.domain!,
            errorCode: safe.errorCode!,
            requestId: context.requestId,
            jobRunId: context.jobRunId,
          },
          update: {
            lastSeenAt: now,
            status: "OPEN",
            resolvedAt: null,
            occurrences: { increment: 1 },
            requestId: context.requestId,
            jobRunId: context.jobRunId,
          },
        });
        return existing?.status === "OPEN" ? null : "opened";
      },
      { timeout: 1500, maxWait: 1000 },
    );
    if (transition)
      log(
        transition === "opened" ? "error" : "info",
        "incident." + transition,
        { domain: safe.domain, errorCode: safe.errorCode },
      );
  } catch {
    log("warn", "telemetry.persistence_unavailable", {
      domain: "operations",
      errorCode: "TELEMETRY_UNAVAILABLE",
    });
  }
}
