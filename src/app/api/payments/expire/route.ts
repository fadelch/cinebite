import { observedRoute } from "@/server/http/observed-route";
import { runObservedJob } from "@/server/observability/jobs";
import { timingSafeEqual } from "node:crypto";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { expirePaymentReservations } from "@/server/repositories/payment.repository";
import { drainRefundRequests } from "@/server/repositories/refund.repository";
export const runtime = "nodejs";
async function POSTHandler(request: Request) {
  const secret = process.env.PAYMENT_EXPIRY_JOB_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new Response(null, { status: 401 });
  try { return apiSuccess(await runObservedJob("PAYMENT_RECOVERY", async () => ({ ...await expirePaymentReservations(), refundRecovery: await drainRefundRequests() }), result => ({ processed: result.expired + result.refundRecovery.dispatched, failed: result.cancellationRetries + result.refundRecovery.pendingRecovery }))); } catch (error) { return apiError(error); }
}

export const POST = observedRoute("POST.api.payments.expire", POSTHandler);
