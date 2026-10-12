import { observedRoute } from "@/server/http/observed-route";
import { conditionalJson } from '@/server/http/conditional-json';
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
async function GETHandler(request: Request) {
  try {
    return conditionalJson(request, await getStaffNotifications(notificationQuery(request)));
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
    return apiSuccess(await markStaffNotificationsRead(input));
  } catch (error) {
    return apiError(error);
  }
}

export const GET = observedRoute("GET.api.notifications", GETHandler);
export const POST = observedRoute("POST.api.notifications", POSTHandler);
