import { observedRoute } from "@/server/http/observed-route";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { getDeliveryQueue } from "@/server/services/delivery.service";
export const runtime = "nodejs";
async function GETHandler(request: Request) {
  try { return apiSuccess(await getDeliveryQueue(Object.fromEntries(new URL(request.url).searchParams))); } catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.delivery.orders", GETHandler);
