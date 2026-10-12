import { observedRoute } from "@/server/http/observed-route";
import { runObservedJob } from "@/server/observability/jobs";
import { timingSafeEqual } from "node:crypto";
import {
  processNotificationOutbox,
  pruneNotifications,
} from "@/server/notifications/processor";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { notificationJobSecret } from "@/lib/notifications/config";
export const runtime = "nodejs";
export const maxDuration = 60;
async function POSTHandler(request: Request) {
  const secret = notificationJobSecret(),
    supplied = request.headers.get("authorization") ?? "",
    expected = `Bearer ${secret}`;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return new Response(null, { status: 401 });
  try {
    return apiSuccess(await runObservedJob("NOTIFICATIONS", async () => ({
      ...(await processNotificationOutbox()),
      ...(await pruneNotifications()),
    }), result => ({ processed: result.processed, failed: result.failed + result.retry })));
  } catch (error) {
    return apiError(error);
  }
}

export const POST = observedRoute("POST.api.notifications.process", POSTHandler);
