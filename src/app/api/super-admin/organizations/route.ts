import { observedRoute } from "@/server/http/observed-route";
import { toOrganizationDto } from "@/lib/super-admin/dto";
import { isSameOriginRequest } from "@/server/auth/request-security";
import {
  apiError,
  apiSuccess,
  forbiddenOrigin,
  invalidRequestBody,
} from "@/server/http/api-response";
import {
  listOrganizationsForSuperAdmin,
} from "@/server/services/organization-management.service";
import { onboardOrganization } from "@/server/services/organization-onboarding.service";

export const runtime = "nodejs";

async function GETHandler() {
  try {
    const organizations = await listOrganizationsForSuperAdmin();
    return apiSuccess({ organizations: organizations.map(toOrganizationDto) });
  } catch (error) {
    return apiError(error);
  }
}

async function POSTHandler(request: Request) {
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
    const result = await onboardOrganization(input);
    return apiSuccess(result, 201);
  } catch (error) {
    return apiError(error);
  }
}

export const GET = observedRoute("GET.api.super-admin.organizations", GETHandler);
export const POST = observedRoute("POST.api.super-admin.organizations", POSTHandler);
