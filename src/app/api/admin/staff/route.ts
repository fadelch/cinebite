import {
  listStaff,
  inviteStaff,
} from "@/server/services/staff-management.service";
import {
  settingsGet,
  settingsMutation,
  settingsQuery,
} from "@/server/http/settings-request";
export async function GET(request: Request) {
  return settingsGet(() => listStaff(settingsQuery(request)));
}
export async function POST(request: Request) {
  return settingsMutation(request, inviteStaff, 201);
}
