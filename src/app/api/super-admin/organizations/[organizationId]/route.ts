import { toOrganizationDetailDto } from "@/lib/super-admin/dto";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { ServiceError } from "@/server/services/service-error";
import { getOrganizationForSuperAdmin } from "@/server/services/organization-management.service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await context.params;
    const detail = await getOrganizationForSuperAdmin(organizationId);

    if (!detail) {
      throw new ServiceError(
        "ORGANIZATION_NOT_FOUND",
        404,
        "Organization not found.",
      );
    }

    return apiSuccess(toOrganizationDetailDto(detail));
  } catch (error) {
    return apiError(error);
  }
}
