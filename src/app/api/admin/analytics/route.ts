import { observedRoute } from "@/server/http/observed-route";
import { getAnalytics } from "@/server/services/analytics.service";
import { apiError, apiSuccess } from "@/server/http/api-response";
async function GETHandler(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input: Record<string, string | string[]> = {};
    for (const key of new Set(params.keys()))
      input[key] =
        params.getAll(key).length > 1 ? params.getAll(key) : params.get(key)!;
    return apiSuccess(await getAnalytics(input));
  } catch (error) {
    return apiError(error);
  }
}
export const runtime = "nodejs";

export const GET = observedRoute("GET.api.admin.analytics", GETHandler);
