import { observedRoute } from "@/server/http/observed-route";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { getInventoryMovements } from "@/server/services/inventory.service";

export const runtime = "nodejs";

async function GETHandler(request: Request) {
  try { return apiSuccess(await getInventoryMovements(Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.admin.inventory.movements", GETHandler);
