import { observedRoute } from "@/server/http/observed-route";
import {
  listStaff,
  inviteStaff,
} from "@/server/services/staff-management.service";
import {
  settingsGet,
  settingsMutation,
  settingsQuery,
} from "@/server/http/settings-request";
async function GETHandler(request: Request) {
  return settingsGet(() => listStaff(settingsQuery(request)));
}
async function POSTHandler(request: Request) {
  return settingsMutation(request, inviteStaff, 201);
}

export const GET = observedRoute("GET.api.admin.staff", GETHandler);
export const POST = observedRoute("POST.api.admin.staff", POSTHandler);
