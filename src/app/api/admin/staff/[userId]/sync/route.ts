import { observedRoute } from "@/server/http/observed-route";
import { repairStaffIdentity } from "@/server/services/staff-management.service";
import { settingsMutation } from "@/server/http/settings-request";
import { z } from "zod";
async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  return settingsMutation(request, async (input) => {
    z.object({}).strict().parse(input);
    return repairStaffIdentity((await params).userId);
  });
}

export const POST = observedRoute("POST.api.admin.staff.userId.sync", POSTHandler);
