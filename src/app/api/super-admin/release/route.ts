import { observedRoute } from "@/server/http/observed-route";
import { apiSuccess, apiError } from "@/server/http/api-response";
import { requireOperationsActor } from "@/server/observability/operations";
import { releaseStatus } from "@/server/observability/release";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = observedRoute("GET.api.super-admin.release", async () => {
  try {
    await requireOperationsActor();
    return apiSuccess(await releaseStatus());
  } catch (error) {
    return apiError(error);
  }
});
