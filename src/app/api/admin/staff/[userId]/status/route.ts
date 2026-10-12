import { observedRoute } from "@/server/http/observed-route";
import { setStaffActive } from "@/server/services/staff-management.service";
import { settingsMutation } from "@/server/http/settings-request";
async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  return settingsMutation(request, async (input) =>
    setStaffActive((await params).userId, input),
  );
}

export const POST = observedRoute("POST.api.admin.staff.userId.status", POSTHandler);
