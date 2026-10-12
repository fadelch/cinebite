import { observedRoute } from "@/server/http/observed-route";
import { restartStaffSetup } from "@/server/services/staff-management.service";
import { settingsMutation } from "@/server/http/settings-request";
async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  return settingsMutation(request, async (input) =>
    restartStaffSetup((await params).userId, input),
  );
}

export const POST = observedRoute("POST.api.admin.staff.userId.setup", POSTHandler);
