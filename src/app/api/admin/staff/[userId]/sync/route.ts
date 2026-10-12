import { repairStaffIdentity } from "@/server/services/staff-management.service";
import { settingsMutation } from "@/server/http/settings-request";
import { z } from "zod";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  return settingsMutation(request, async (input) => {
    z.object({}).strict().parse(input);
    return repairStaffIdentity((await params).userId);
  });
}
