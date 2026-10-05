import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getPaymentProvider, sandboxSignature } from "@/lib/payments/provider";
import { paymentConfig } from "@/lib/payments/config";
import { drainProviderCancellations, expirePaymentReservations, getOwnedPayment, initializeProviderPayment, limitPaymentRequests, processVerifiedPaymentEvent, retryPaymentRecord } from "@/server/repositories/payment.repository";
import { validateCustomerSession } from "./customer-session.service";
import { ServiceError } from "./service-error";
import { orderCodeSchema } from "@/validation/order";
import { paymentRetrySchema, sandboxOutcomeSchema } from "@/validation/payment";

export async function customerPaymentStatus(rawToken: string | undefined, publicCodeInput: string) {
  const publicCode = orderCodeSchema.parse(publicCodeInput);
  const session = await validateCustomerSession(rawToken);
  await limitPaymentRequests(session.id, "status");
  await expirePaymentReservations();
  await initializeProviderPayment(session.id, publicCode);
  return getOwnedPayment(session.id, publicCode);
}
export async function retryCustomerPayment(rawToken: string | undefined, codeInput: string, input: unknown) {
  paymentConfig();
  const code = orderCodeSchema.parse(codeInput), parsed = paymentRetrySchema.parse(input);
  const session = await validateCustomerSession(rawToken);
  await limitPaymentRequests(session.id, "initiate");
  await expirePaymentReservations();
  await retryPaymentRecord(session.id, code, parsed.idempotencyKey);
  await initializeProviderPayment(session.id, code);
  return getOwnedPayment(session.id, code);
}
export async function receivePaymentWebhook(raw: string, signature: string | null) {
  const result = await processVerifiedPaymentEvent(getPaymentProvider().verifyWebhook(raw, signature));
  const { cancellationAttemptId, ...publicResult } = result;
  // Only this event's related compensation; do not drain unrelated work on a webhook.
  if (cancellationAttemptId) await drainProviderCancellations(new Date(), cancellationAttemptId);
  return publicResult;
}

// Explicit TEST controls only, no payment/card inputs. Owner + same-origin required.
// The server simulates provider state and delivers its signed sandbox event;
// it does not trust a customer success URL or install a real-money adapter.
export async function simulateCustomerPayment(rawToken: string | undefined, codeInput: string, input: unknown) {
  paymentConfig();
  const code = orderCodeSchema.parse(codeInput), { outcome } = sandboxOutcomeSchema.parse(input);
  const session = await validateCustomerSession(rawToken);
  await limitPaymentRequests(session.id, "initiate");
  await expirePaymentReservations();
  await initializeProviderPayment(session.id, code);
  const payment = await prisma.payment.findFirst({ where: { order: { customerSessionId: session.id, publicOrderCode: code } }, include: { attempts: { orderBy: { number: "desc" }, take: 1 } } });
  if (!payment) throw new ServiceError("PAYMENT_NOT_FOUND", 404, "Payment not found.");
  const attempt = payment.attempts[0];
  if (!attempt.providerPaymentId || !["PENDING", "PROCESSING"].includes(attempt.status) || attempt.expiresAt <= new Date() || payment.reviewRequired) throw new ServiceError("PAYMENT_CONFLICT", 409, "This payment session has ended.");
  await prisma.sandboxPaymentIntent.updateMany({ where: { id: attempt.providerPaymentId, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: outcome } });
  const result = await getPaymentProvider().retrieve(attempt.providerPaymentId);
  const raw = JSON.stringify({ ...result, eventId: `sandbox-event:${randomUUID()}` });
  await receivePaymentWebhook(raw, sandboxSignature(raw));
  return getOwnedPayment(session.id, code);
}
