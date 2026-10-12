import { updateBrandingSettings } from "@/server/services/organization-settings.service";
import { settingsMutation } from "@/server/http/settings-request";
export async function POST(request: Request) {
  return settingsMutation(request, updateBrandingSettings);
}
