import { toHallDto, toTenantLocationDto } from "@/lib/tenant-admin/dto";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { getTenantLocationDetail } from "@/server/services/tenant-structure.service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ locationId: string }> },
) {
  try {
    const { locationId } = await context.params;
    const detail = await getTenantLocationDetail(locationId);
    if (!detail) return apiSuccess({ error: "Location not found." }, 404);
    return apiSuccess({
      location: toTenantLocationDto(detail.location),
      halls: detail.halls.map(toHallDto),
    });
  } catch (error) {
    return apiError(error);
  }
}
