import { observedRoute } from "@/server/http/observed-route";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { getOperations } from "@/server/observability/operations";
export const runtime = "nodejs";
async function GETHandler() {
  try {
    return apiSuccess(await getOperations());
  } catch (error) {
    return apiError(error);
  }
}

export const GET = observedRoute("GET.api.super-admin.operations", GETHandler);
