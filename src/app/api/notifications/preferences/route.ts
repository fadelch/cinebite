import { observedRoute } from "@/server/http/observed-route";
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
async function GETHandler() {
  try {
    return apiSuccess(await getNotificationPreferences());
  } catch (error) {
    return apiError(error);
  }
}
async function POSTHandler(request: Request) {
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

export const GET = observedRoute("GET.api.notifications.preferences", GETHandler);
export const POST = observedRoute("POST.api.notifications.preferences", POSTHandler);
