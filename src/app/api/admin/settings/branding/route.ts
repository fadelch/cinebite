import { observedRoute } from "@/server/http/observed-route";
import { updateBrandingSettings } from "@/server/services/organization-settings.service";
import { settingsMutation } from "@/server/http/settings-request";
async function POSTHandler(request: Request) {
  return settingsMutation(request, updateBrandingSettings);
}

export const POST = observedRoute("POST.api.admin.settings.branding", POSTHandler);
