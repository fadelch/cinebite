import { apiError, apiSuccess } from "@/server/http/api-response";
import { getDeliveryQueue } from "@/server/services/delivery.service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return apiSuccess(await getDeliveryQueue(Object.fromEntries(new URL(request.url).searchParams))); } catch (error) { return apiError(error); }
}
