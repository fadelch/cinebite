import {
  getNotificationPreferences,
  saveNotificationPreference,
} from "@/server/services/notification.service";
import {
  apiError,
  apiSuccess,
  forbiddenOrigin,
  invalidRequestBody,
} from "@/server/http/api-response";
import { notificationBody } from "@/server/http/notification-request";
import { isSameOriginRequest } from "@/server/auth/request-security";
export async function GET() {
  try {
    return apiSuccess(await getNotificationPreferences());
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
    return apiSuccess(await saveNotificationPreference(input));
  } catch (error) {
    return apiError(error);
  }
}
