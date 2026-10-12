import { observedRoute } from "@/server/http/observed-route";
import { toLocationDto } from "@/lib/super-admin/dto";
import { isSameOriginRequest } from "@/server/auth/request-security";
import {
  apiError,
  apiSuccess,
  forbiddenOrigin,
  invalidRequestBody,
} from "@/server/http/api-response";
import { addOrganizationLocation } from "@/server/services/organization-management.service";

export const runtime = "nodejs";

async function POSTHandler(
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
    const location = await addOrganizationLocation(organizationId, input);
    return apiSuccess({ location: toLocationDto(location) }, 201);
  } catch (error) {
    return apiError(error);
  }
}

export const POST = observedRoute("POST.api.super-admin.organizations.organizationId.locations", POSTHandler);
