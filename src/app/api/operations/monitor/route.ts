import { observedRoute } from "@/server/http/observed-route";
import { timingSafeEqual } from "node:crypto";
import { apiError, apiSuccess } from "@/server/http/api-response";
import {
  refreshOperationalIncidents,
  pruneOperationalTelemetry,
} from "@/server/observability/operations";
import { runObservedJob } from "@/server/observability/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
async function POSTHandler(request: Request) {
  const secret = process.env.OBSERVABILITY_JOB_SECRET,
    supplied = request.headers.get("authorization") ?? "",
    expected = "Bearer " + secret;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return new Response(null, { status: 401 });
  try {
    const result = await runObservedJob(
      "OPERATIONS_MONITOR",
      async () => {
        const health = await refreshOperationalIncidents();
        await pruneOperationalTelemetry();
        return health;
      },
      (health) => ({
        processed: 1,
        failed: health.status === "UNHEALTHY" ? 1 : 0,
      }),
    );
    return apiSuccess({ status: result.status });
  } catch (error) {
    return apiError(error);
  }
}

export const POST = observedRoute("POST.api.operations.monitor", POSTHandler);
