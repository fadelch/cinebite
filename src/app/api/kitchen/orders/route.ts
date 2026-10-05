import { apiError, apiSuccess } from "@/server/http/api-response";
import { getKitchenQueue } from "@/server/services/kitchen.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return apiSuccess(await getKitchenQueue(Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}
