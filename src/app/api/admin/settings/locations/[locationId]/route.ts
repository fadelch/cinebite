import {
  getLocationSettings,
  updateLocationSettings,
} from "@/server/services/organization-settings.service";
import { settingsGet, settingsMutation } from "@/server/http/settings-request";
type Context = { params: Promise<{ locationId: string }> };
export async function GET(_request: Request, context: Context) {
  return settingsGet(async () =>
    getLocationSettings((await context.params).locationId),
  );
}
export async function POST(request: Request, context: Context) {
  return settingsMutation(request, async (input) =>
    updateLocationSettings((await context.params).locationId, input),
  );
}
