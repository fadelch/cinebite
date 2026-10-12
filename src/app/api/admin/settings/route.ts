import {
  getOrganizationSettings,
  updateOrganizationSettings,
} from "@/server/services/organization-settings.service";
import { settingsGet, settingsMutation } from "@/server/http/settings-request";
export async function GET() {
  return settingsGet(getOrganizationSettings);
}
export async function POST(request: Request) {
  return settingsMutation(request, updateOrganizationSettings);
}
