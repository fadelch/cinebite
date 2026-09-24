import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { createInventoryItem, getInventoryItems } from "@/server/services/inventory.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return apiSuccess(await getInventoryItems(Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try { return apiSuccess({ item: await createInventoryItem(input) }, 201); }
  catch (error) { return apiError(error); }
}
