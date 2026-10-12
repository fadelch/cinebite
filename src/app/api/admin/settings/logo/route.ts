import { replaceOrganizationLogo } from "@/server/services/organization-settings.service";
import {
  settingsMutation,
  settingsFormData,
} from "@/server/http/settings-request";
import { settingsActor } from "@/server/services/settings-context";
import { isSameOriginRequest } from "@/server/auth/request-security";
import {
  apiSuccess,
  apiError,
  forbiddenOrigin,
  invalidRequestBody,
} from "@/server/http/api-response";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024)
    return invalidRequestBody();
  try {
    await settingsActor(true);
    const form = await settingsFormData(request);
    if (
      [...form.keys()].some((key) => !["version", "image"].includes(key)) ||
      form.getAll("image").length !== 1 ||
      form.getAll("version").length !== 1
    )
      return invalidRequestBody();
    const file = form.get("image");
    if (!(file instanceof File)) return invalidRequestBody();
    return apiSuccess(
      await replaceOrganizationLogo(
        { version: Number(form.get("version")) },
        file,
      ),
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError)
      return invalidRequestBody();
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  return settingsMutation(request, (input) =>
    replaceOrganizationLogo(input, null),
  );
}
