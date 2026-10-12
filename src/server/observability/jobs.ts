import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  currentObservation,
  newJobRunId,
  observationScope,
} from "@/lib/observability/context";
import { observabilityConfig } from "@/lib/observability/config";
import { log } from "@/lib/observability/logger";
import { normalizeError } from "@/lib/observability/errors";
import { recordIncident } from "./incident";
export type JobType =
  "NOTIFICATIONS" | "PAYMENT_RECOVERY" | "OPERATIONS_MONITOR";
export async function runObservedJob<T>(
  jobType: JobType,
  action: () => Promise<T>,
  counts: (result: T) => { processed: number; failed: number },
) {
  const jobRunId = newJobRunId(),
    started = performance.now(),
    config = observabilityConfig();
  return observationScope({ jobRunId }, async () => {
    try {
      await prisma.jobRun.create({
        data: {
          id: jobRunId,
          jobType,
          requestId: currentObservation().requestId,
          environment: config.environment,
          release: config.release,
        },
      });
    } catch {
      log("warn", "job.telemetry_unavailable", {
        jobType,
        errorCode: "TELEMETRY_UNAVAILABLE",
      });
    }
    log("info", "job.started", { jobType });
    let processed = 0,
      failed = 0,
      errorCode: string | null = null,
      status: "SUCCEEDED" | "PARTIAL" | "FAILED" = "SUCCEEDED";
    try {
      const result = await action(),
        summary = counts(result);
      processed = Math.max(
        0,
        Math.min(2147483647, Math.trunc(summary.processed)),
      );
      failed = Math.max(0, Math.min(2147483647, Math.trunc(summary.failed)));
      if (failed > 0) {
        status = "PARTIAL";
        errorCode = "JOB_PARTIAL_FAILURE";
      }
      return result;
    } catch (error) {
      status = "FAILED";
      failed = 1;
      errorCode = normalizeError(error).code;
      throw error;
    } finally {
      const durationMs = Math.min(
        2147483647,
        Math.max(0, Math.round(performance.now() - started)),
      );
      log(
        status === "FAILED" ? "error" : status === "PARTIAL" ? "warn" : "info",
        "job.completed",
        {
          jobType,
          status,
          durationMs,
          processedCount: processed,
          failedCount: failed,
          ...(errorCode ? { errorCode } : {}),
        },
      );
      try {
        await prisma.jobRun.updateMany({
          where: { id: jobRunId, status: "RUNNING" },
          data: {
            completedAt: new Date(),
            status,
            processedCount: processed,
            failedCount: failed,
            durationMs,
            safeErrorCode: errorCode,
          },
        });
      } catch {
        log("warn", "job.telemetry_unavailable", {
          jobType,
          errorCode: "TELEMETRY_UNAVAILABLE",
        });
      }
      await recordIncident(
        "job." + jobType,
        "JOB_FAILURE",
        status !== "SUCCEEDED",
      );
    }
  });
}
