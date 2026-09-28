import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { generateMissingSeatQrs } from "@/server/services/seat-qr.service";
import { seatQrBulkSchema } from "@/validation/seat-qr";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ locationId: string; hallId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    seatQrBulkSchema.parse(input);
    const { locationId, hallId } = await context.params;
    return apiSuccess(await generateMissingSeatQrs(locationId, hallId), 201);
  } catch (error) { return apiError(error); }
}
