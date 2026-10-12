import "server-only";
import { newRequestId, observationScope } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";
import { normalizeError, expectedLevel } from "@/lib/observability/errors";
import { observabilityConfig } from "@/lib/observability/config";
import { recordIncident } from "@/server/observability/incident";
import { captureTrackedError } from "@/lib/observability/error-tracker";
import { secureRequest } from "@/server/security/request-boundary";
import { authorizationScope } from '@/server/auth/authorization-context';
export function observedRoute<Args extends unknown[]>(
  operation: string,
  handler: (...args: Args) => Promise<Response> | Response,
) {
  return async (...args: Args) =>
    authorizationScope(() => observationScope({ requestId: newRequestId(), operation }, async () => {
      const started = performance.now();
      let response: Response;
      try {
        if (args[0] instanceof Request) args[0] = await secureRequest(args[0]);
        response = await handler(...args);
      } catch (error) {
        const failure = normalizeError(error);
        const { currentObservation } =
          await import("@/lib/observability/context");
        response = Response.json(
          {
            error: failure.message,
            code: failure.code,
            requestId: currentObservation().requestId,
          },
          { status: failure.status, headers: { "Cache-Control": "no-store" } },
        );
      }
      const { currentObservation } =
        await import("@/lib/observability/context");
      const requestId = currentObservation().requestId!;
      response.headers.set("X-Request-ID", requestId);
      if (response.status === 429) response.headers.set("Retry-After", "60");
      const durationMs = performance.now() - started;
      log(expectedLevel(response.status), "http.completed", {
        operation,
        statusCode: response.status,
        durationMs,
      });
      if (durationMs >= observabilityConfig().slowRequestMs)
        log("warn", "http.slow", {
          operation,
          statusCode: response.status,
          durationMs,
        });
      // Persist only unexpected service failures, not ordinary auth/stock/concurrency conflicts.
      if (
        response.status >= 500 &&
        !operation.endsWith(".health") &&
        !operation.endsWith(".ready")
      ) {
        let code = "UNKNOWN_INTERNAL_ERROR";
        try {
          const data = await response.clone().json();
          if (typeof data.code === "string" && /^[A-Z_]{1,60}$/.test(data.code))
            code = data.code;
        } catch {}
        await captureTrackedError("http.failed", {
          operation,
          errorCode: code,
          durationMs,
          statusCode: response.status,
        });
        await recordIncident(
          operation.replace(/[^a-zA-Z0-9_.:-]/g, ".").slice(0, 100),
          code,
        );
      }
      return response;
    }));
}
