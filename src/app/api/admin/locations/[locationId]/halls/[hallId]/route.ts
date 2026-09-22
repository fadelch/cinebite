import { toHallDto, toSeatDto, toTenantLocationDto } from "@/lib/tenant-admin/dto";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { getTenantHallDetail } from "@/server/services/tenant-structure.service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ locationId: string; hallId: string }> },
) {
  try {
    const { locationId, hallId } = await context.params;
    const detail = await getTenantHallDetail(locationId, hallId);
    if (!detail) return apiSuccess({ error: "Hall not found." }, 404);
    return apiSuccess({
      location: toTenantLocationDto(detail.location),
      hall: toHallDto(detail.hall),
      seats: detail.seats.map(toSeatDto),
    });
  } catch (error) {
    return apiError(error);
  }
}
