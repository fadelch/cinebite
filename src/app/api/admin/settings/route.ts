import { observedRoute } from "@/server/http/observed-route";
import {
  getOrganizationSettings,
  updateOrganizationSettings,
} from "@/server/services/organization-settings.service";
import { settingsGet, settingsMutation } from "@/server/http/settings-request";
async function GETHandler() {
  return settingsGet(getOrganizationSettings);
}
async function POSTHandler(request: Request) {
  return settingsMutation(request, updateOrganizationSettings);
}

export const GET = observedRoute("GET.api.admin.settings", GETHandler);
export const POST = observedRoute("POST.api.admin.settings", POSTHandler);
