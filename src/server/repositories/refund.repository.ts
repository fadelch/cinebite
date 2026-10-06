import "server-only";
import { prisma } from "@/lib/db/prisma";
import { paymentMinorUnits } from "@/lib/payments/policy";
import { canAdvanceRefund, refundableBalance } from "@/lib/payments/refund-policy";
import { getPaymentProvider, type ProviderRefundEvent } from "@/lib/payments/provider";
import { serial } from "./payment.repository";
import { authorizeOrderStaff, lockOrder } from "./cancellation.repository";
import { createSystemIssue, stageRefund } from "./refund-domain";
import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";
import type { z } from "zod";
import type { refundSchema } from "@/validation/cancellation";

export async function createRefundRecord(actor: AuthenticatedUser, orderId: string, input: z.infer<typeof refundSchema>) {
  return serial(async tx => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found.");
    const { user } = await authorizeOrderStaff(tx, actor, order);
    if (!order.payment) throw new ServiceError("REFUND_NOT_ELIGIBLE", 409, "No captured payment exists for this order.");
    if (input.kind === "PARTIAL" && !input.amount) throw new ServiceError("REFUND_NOT_ELIGIBLE", 400, "Enter a partial refund amount.");
    return stageRefund(tx, { payment: order.payment, key: input.idempotencyKey, amount: input.kind === "PARTIAL" ? input.amount : undefined,
      reasonCode: input.reasonCode, reasonNote: input.reasonNote, actorType: "STAFF", actorUserId: user.id });
  });
}
export async function retryRefundRecord(actor: AuthenticatedUser, orderId: string, refundId: string, key: string) {
  return serial(async tx => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found.");
    const { user } = await authorizeOrderStaff(tx, actor, order);
    const failed = await tx.refund.findFirst({ where: { id: refundId, orderId, status: "FAILED" } });
    if (!failed || !order.payment) throw new ServiceError("REFUND_NOT_ELIGIBLE", 409, "Only a confirmed failed refund can be retried.");
    const existing = await tx.refund.findUnique({ where: { retryOfId: failed.id } });
    if (existing) return existing;
    return stageRefund(tx, { payment: order.payment, key, amount: failed.amount.toFixed(2), reasonCode: failed.reasonCode,
      reasonNote: failed.reasonNote ?? undefined, actorType: "STAFF", actorUserId: user.id, retryOfId: failed.id });
  });
}

// A durable PENDING row is an outbox. Unknown provider failures stay committed,
// never FAILED/free-to-refund again until an authenticated terminal result.
export async function dispatchRefund(refundId: string) {
  const refund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  if (!["PENDING", "PROCESSING"].includes(refund.status)) return;
  const provider = getPaymentProvider();
  const result = refund.providerRefundId ? await provider.retrieveRefund(refund.providerRefundId)
    : await provider.createRefund({ refundId: refund.id, providerPaymentId: refund.payment.providerPaymentId!,
      amountMinor: paymentMinorUnits(refund.amount.toFixed(2), refund.currencyCode), currencyCode: refund.currencyCode });
  await serial(async tx => {
    await lockOrder(tx, refund.orderId);
    const current = await tx.refund.findUniqueOrThrow({ where: { id: refund.id } });
    if (current.providerRefundId && current.providerRefundId !== result.providerRefundId) throw new ServiceError("REFUND_CONFLICT", 409, "Refund provider binding changed.");
    if (!current.providerRefundId) await tx.refund.update({ where: { id: refund.id }, data: { providerRefundId: result.providerRefundId } });
  });
  await processVerifiedRefundEvent({ ...result, kind: "refund", eventId: `refund-retrieval:${result.providerRefundId}:${result.status}` });
}
export async function drainRefundRequests(orderId?: string) {
  const refunds = await prisma.refund.findMany({ where: { status: { in: ["PENDING", "PROCESSING"] }, ...(orderId ? { orderId } : {}) }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 100 });
  let pendingRecovery = 0;
  for (const refund of refunds) {
    try { await dispatchRefund(refund.id); } catch { pendingRecovery++; }
    // Rotate processed/temporarily unavailable intents so an old provider outage
    // cannot permanently starve later refunds in bounded recovery batches.
    await prisma.refund.updateMany({ where: { id: refund.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { updatedAt: new Date() } });
  }
  return { pendingRecovery, batchLimit: 100 };
}
export async function processVerifiedRefundEvent(event: ProviderRefundEvent, now = new Date()) {
  return serial(async tx => {
    const where = { provider_providerEventId: { provider: "sandbox", providerEventId: event.eventId } };
    const replay = await tx.paymentWebhookEvent.findUnique({ where });
    if (replay) return { duplicate: true, status: replay.status };
    const found = await tx.refund.findUnique({ where: { id: event.refundId } });
    const journal = { provider: "sandbox", providerEventId: event.eventId, eventType: event.status, processedAt: now };
    if (!found) { await tx.paymentWebhookEvent.create({ data: { ...journal, status: "REJECTED", failureCode: "UNKNOWN_REFUND" } }); return { status: "REJECTED" }; }
    await lockOrder(tx, found.orderId);
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: found.id }, include: { payment: true, order: true } });
    const matches = refund.provider === "sandbox" && refund.providerRefundId === event.providerRefundId
      && refund.payment.providerPaymentId === event.providerPaymentId && refund.payment.status === "SUCCEEDED"
      && refund.currencyCode === event.currencyCode && refund.payment.currencyCode === event.currencyCode
      && paymentMinorUnits(refund.amount.toFixed(2), refund.currencyCode) === event.amountMinor;
    if (!matches) { await tx.paymentWebhookEvent.create({ data: { ...journal, status: "REJECTED", failureCode: "REFUND_BINDING_MISMATCH" } }); return { status: "REJECTED" }; }
    if (!canAdvanceRefund(refund.status, event.status)) { await tx.paymentWebhookEvent.create({ data: { ...journal, status: "IGNORED", failureCode: "REFUND_TERMINAL_OR_STALE" } }); return { status: "IGNORED" }; }
    await tx.refund.update({ where: { id: refund.id }, data: { status: event.status,
      ...(event.status === "SUCCEEDED" ? { succeededAt: now } : event.status === "FAILED" ? { failedAt: now } : {}) } });
    if (["SUCCEEDED", "FAILED"].includes(event.status)) await tx.auditLog.create({ data: {
      action: event.status === "SUCCEEDED" ? "REFUND_SUCCEEDED" : "REFUND_FAILED", entityType: "ORDER", entityId: refund.orderId,
      organizationId: refund.order.organizationId, locationId: refund.order.locationId,
      metadata: { refundId: refund.id, amount: refund.amount.toFixed(2), currencyCode: refund.currencyCode } } });
    if (event.status === "FAILED") await createSystemIssue(tx, refund.orderId, "PAYMENT_REFUND_FAILED", `refund-failed:${refund.id}`, "Refund failed. Authorized supervisor must review and explicitly retry; do not claim money was returned.");
    await tx.paymentWebhookEvent.create({ data: { ...journal, status: "PROCESSED" } });
    return { status: "PROCESSED" };
  });
}
export async function financialSummaryRecord(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true, cancellation: true,
    refunds: { orderBy: { createdAt: "asc" } }, issues: { orderBy: { createdAt: "asc" } } } });
  const balance = refundableBalance(order.payment?.status === "SUCCEEDED" ? order.payment.amount.toFixed(2) : "0.00", order.refunds.map(r => ({ amount: r.amount.toFixed(2), status: r.status })));
  return { ...balance, status: order.status, canCancel: customerMayCancelSafe(order.status),
    paidAmount: order.payment?.status === "SUCCEEDED" ? order.payment.amount.toFixed(2) : "0.00", paymentStatus: order.payment?.status ?? "LEGACY_NOT_REQUIRED",
    currencyCode: order.currencyCode,
    cancellation: order.cancellation ? { fromStatus: order.cancellation.fromStatus, reasonCode: order.cancellation.reasonCode, reasonNote: order.cancellation.reasonNote, initiatedByType: order.cancellation.initiatedByType,
      inventoryDisposition: order.cancellation.inventoryDisposition, createdAt: order.cancellation.createdAt.toISOString() } : null,
    refunds: order.refunds.map(r => ({ id: r.id, status: r.status, amount: r.amount.toFixed(2), currencyCode: r.currencyCode,
      reasonCode: r.reasonCode, reasonNote: r.reasonNote, initiatedByType: r.initiatedByType, createdAt: r.createdAt.toISOString(), succeededAt: r.succeededAt?.toISOString() ?? null, retryOfId: r.retryOfId,
      retryStatus: order.refunds.find(next => next.retryOfId === r.id)?.status ?? null })),
    issues: order.issues.map(i => ({ id: i.id, type: i.type, status: i.status, note: i.note, resolution: i.resolution,
      createdAt: i.createdAt.toISOString(), resolvedAt: i.resolvedAt?.toISOString() ?? null })) };
}
function customerMayCancelSafe(status: string) { return status === "PLACED"; }
