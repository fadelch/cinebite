import { toSeatDto } from "@/lib/tenant-admin/dto";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { changeTenantSeatStatus } from "@/server/services/tenant-structure.service";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ locationId: string; hallId: string; seatId: string }> },
) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidRequestBody();
  }
  try {
    const { locationId, hallId, seatId } = await context.params;
    const seat = await changeTenantSeatStatus(locationId, hallId, seatId, input);
    return apiSuccess({ seat: toSeatDto(seat) });
  } catch (error) {
    return apiError(error);
  }
}
