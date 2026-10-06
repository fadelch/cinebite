import {
  getStaffNotifications,
  markStaffNotificationsRead,
} from "@/server/services/notification.service";
import {
  apiError,
  apiSuccess,
  forbiddenOrigin,
  invalidRequestBody,
} from "@/server/http/api-response";
import {
  notificationBody,
  notificationQuery,
} from "@/server/http/notification-request";
import { isSameOriginRequest } from "@/server/auth/request-security";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return apiSuccess(await getStaffNotifications(notificationQuery(request)));
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input;
  try {
    input = await notificationBody(request);
  } catch {
    return invalidRequestBody();
  }
  try {
    return apiSuccess(await markStaffNotificationsRead(input));
  } catch (error) {
    return apiError(error);
  }
}
