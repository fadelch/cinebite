import { toTenantLocationDto } from "@/lib/tenant-admin/dto";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { createLocationForTenant, listLocationsForTenantUser } from "@/server/services/tenant-structure.service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const locations = await listLocationsForTenantUser();
    return apiSuccess({ locations: locations.map(toTenantLocationDto) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidRequestBody();
  }
  try {
    const location = await createLocationForTenant(input);
    return apiSuccess({ location: toTenantLocationDto(location) }, 201);
  } catch (error) {
    return apiError(error);
  }
}
