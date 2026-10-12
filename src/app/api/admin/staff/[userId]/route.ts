import { observedRoute } from "@/server/http/observed-route";
import {
  getStaff,
  editStaff,
} from "@/server/services/staff-management.service";
import { settingsGet, settingsMutation } from "@/server/http/settings-request";
type Context = { params: Promise<{ userId: string }> };
async function GETHandler(_request: Request, context: Context) {
  return settingsGet(async () => getStaff((await context.params).userId));
}
async function POSTHandler(request: Request, context: Context) {
  return settingsMutation(request, async (input) =>
    editStaff((await context.params).userId, input),
  );
}

export const GET = observedRoute("GET.api.admin.staff.userId", GETHandler);
export const POST = observedRoute("POST.api.admin.staff.userId", POSTHandler);
