import { apiError, apiSuccess } from "@/server/http/api-response";
import { getInventoryMovements } from "@/server/services/inventory.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return apiSuccess(await getInventoryMovements(Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}
