import { isSameOriginRequest } from "@/server/auth/request-security";
import {
  apiError,
  apiSuccess,
  forbiddenOrigin,
  invalidRequestBody,
} from "@/server/http/api-response";
import { toOrganizationDto } from "@/lib/super-admin/dto";
import { changeOrganizationStatus } from "@/server/services/organization-management.service";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return forbiddenOrigin();
  }

  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return invalidRequestBody();
  }

  try {
    const { organizationId } = await context.params;
    const organization = await changeOrganizationStatus(organizationId, input);
    return apiSuccess({ organization: toOrganizationDto(organization) });
  } catch (error) {
    return apiError(error);
  }
}
