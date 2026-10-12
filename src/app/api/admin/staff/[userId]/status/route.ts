import { setStaffActive } from "@/server/services/staff-management.service";
import { settingsMutation } from "@/server/http/settings-request";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  return settingsMutation(request, async (input) =>
    setStaffActive((await params).userId, input),
  );
}
