import {
  getStaff,
  editStaff,
} from "@/server/services/staff-management.service";
import { settingsGet, settingsMutation } from "@/server/http/settings-request";
type Context = { params: Promise<{ userId: string }> };
export async function GET(_request: Request, context: Context) {
  return settingsGet(async () => getStaff((await context.params).userId));
}
export async function POST(request: Request, context: Context) {
  return settingsMutation(request, async (input) =>
    editStaff((await context.params).userId, input),
  );
}
