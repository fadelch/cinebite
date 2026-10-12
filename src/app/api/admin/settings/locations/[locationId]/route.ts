import { observedRoute } from "@/server/http/observed-route";
import {
  getLocationSettings,
  updateLocationSettings,
} from "@/server/services/organization-settings.service";
import { settingsGet, settingsMutation } from "@/server/http/settings-request";
type Context = { params: Promise<{ locationId: string }> };
async function GETHandler(_request: Request, context: Context) {
  return settingsGet(async () =>
    getLocationSettings((await context.params).locationId),
  );
}
async function POSTHandler(request: Request, context: Context) {
  return settingsMutation(request, async (input) =>
    updateLocationSettings((await context.params).locationId, input),
  );
}

export const GET = observedRoute("GET.api.admin.settings.locations.locationId", GETHandler);
export const POST = observedRoute("POST.api.admin.settings.locations.locationId", POSTHandler);
