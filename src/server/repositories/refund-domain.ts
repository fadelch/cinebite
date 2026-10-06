import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type CancellationReason, type OrderStatusActorType, type Payment } from "@/generated/prisma/client";
import { refundableBalance } from "@/lib/payments/refund-policy";
import { paymentMinorUnits } from "@/lib/payments/policy";
import { ServiceError } from "@/server/services/service-error";

// No provider I/O here: SQL intent commits before the external request.
export async function stageRefund(tx: Prisma.TransactionClient, input: {
  payment: Payment; key: string; amount?: string; reasonCode: CancellationReason; reasonNote?: string;
  actorType: OrderStatusActorType; actorUserId?: string; retryOfId?: string; allowEmpty?: boolean;
}) {
  const { payment } = input;
  const replay = await tx.refund.findUnique({ where: { paymentId_idempotencyKey: { paymentId: payment.id, idempotencyKey: input.key } } });
  if (replay) {
    if (input.amount && !replay.amount.equals(input.amount)) throw new ServiceError("REFUND_CONFLICT", 409, "This refund key was already used for another amount.");
    return replay;
  }
  if (payment.status !== "SUCCEEDED" || !payment.providerPaymentId) throw new ServiceError("REFUND_NOT_ELIGIBLE", 409, "Only a verified captured payment can be refunded.");
  const previous = await tx.refund.findMany({ where: { paymentId: payment.id } });
  const balance = refundableBalance(payment.amount.toFixed(2), previous.map(r => ({ amount: r.amount.toFixed(2), status: r.status })));
  const amount = new Prisma.Decimal(input.amount ?? balance.remainingRefundableAmount);
  if (amount.isZero() && input.allowEmpty) return null;
  if (amount.lte(0) || amount.gt(balance.remainingRefundableAmount)) throw new ServiceError("REFUND_LIMIT_EXCEEDED", 409, "Refund exceeds the remaining refundable amount.");
  try { paymentMinorUnits(amount.toFixed(2), payment.currencyCode); }
  catch { throw new ServiceError("REFUND_NOT_ELIGIBLE", 400, "Refund amount is not valid for the captured currency."); }
  const refund = await tx.refund.create({ data: { id: randomUUID(), paymentId: payment.id, orderId: payment.orderId,
    provider: payment.provider, amount, currencyCode: payment.currencyCode, reasonCode: input.reasonCode,
    reasonNote: input.reasonNote || null, initiatedByType: input.actorType, initiatedByUserId: input.actorUserId,
    idempotencyKey: input.key, retryOfId: input.retryOfId } });
  const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
  await tx.auditLog.create({ data: { action: "REFUND_CREATED", entityType: "ORDER", entityId: order.id,
    actorUserId: input.actorUserId, organizationId: order.organizationId, locationId: order.locationId,
    metadata: { refundId: refund.id, amount: amount.toFixed(2), currencyCode: payment.currencyCode, actorType: input.actorType } } });
  return refund;
}

export async function createSystemIssue(tx: Prisma.TransactionClient, orderId: string, type: "SCREENING_CANCELED" | "PAYMENT_REFUND_FAILED", key: string, note: string) {
  const exists = await tx.orderIssue.findUnique({ where: { deduplicationKey: key } });
  if (exists) return exists;
  const issue = await tx.orderIssue.create({ data: { orderId, type, deduplicationKey: key, note } });
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  await tx.auditLog.create({ data: { action: "ORDER_ISSUE_REPORTED", entityType: "ORDER", entityId: orderId,
    organizationId: order.organizationId, locationId: order.locationId, metadata: { issueId: issue.id, type, actorType: "SYSTEM" } } });
  if (type === "SCREENING_CANCELED") await tx.auditLog.create({ data: { action: "SCREENING_ORDER_RECONCILED", entityType: "ORDER", entityId: orderId,
    organizationId: order.organizationId, locationId: order.locationId, metadata: { classification: "STARTED_ORDER_ISSUE", screeningId: order.screeningId } } });
  return issue;
}
