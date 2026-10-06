import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/server/auth/current-user";
import { validateCustomerSession } from "./customer-session.service";
import { requireScheduleActor } from "./schedule-access.service";
import { ServiceError } from "./service-error";
import { authorizeOrderStaff, cancelOrderRecord, lockOrder, reconcileScreeningOrders, screeningReconciliationPreview } from "@/server/repositories/cancellation.repository";
import { drainProviderCancellations, limitPaymentRequests, serial } from "@/server/repositories/payment.repository";
import { createRefundRecord, drainRefundRequests, financialSummaryRecord, retryRefundRecord } from "@/server/repositories/refund.repository";
import { cancelSchema, customerCancelSchema, issueSchema, refundRetrySchema, refundSchema, resolveIssueSchema } from "@/validation/cancellation";
import { documentIdSchema } from "@/validation/shared";
import { orderCodeSchema } from "@/validation/order";
import { paymentConfig } from "@/lib/payments/config";
import { getPaymentProvider, sandboxSignature } from "@/lib/payments/provider";
import { receivePaymentWebhook } from "./payment.service";
import { z } from "zod";

async function recoverOrder(orderId: string) {
  const attempts = await prisma.paymentAttempt.findMany({ where: { payment: { orderId }, status: { in: ["PENDING", "PROCESSING"] } }, select: { id: true } });
  for (const attempt of attempts) await drainProviderCancellations(new Date(), attempt.id);
  await drainRefundRequests(orderId);
}
export async function customerFinancial(rawToken: string | undefined, codeInput: string) {
  const session = await validateCustomerSession(rawToken), code = orderCodeSchema.parse(codeInput);
  const order = await prisma.order.findFirst({ where: { customerSessionId: session.id, publicOrderCode: code }, select: { id: true } });
  if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found for this seat session.");
  await limitPaymentRequests(session.id, "status");
  const summary = await financialSummaryRecord(order.id);
  // Customer safe projection: never show internal issue notes or provider IDs.
  return { ...summary, issues: [], refunds: summary.refunds.map(({ id: _id, retryOfId: _retry, ...r }) => { void _id; void _retry; return r; }) };
}
export async function cancelCustomerOrder(rawToken: string | undefined, codeInput: string, input: unknown) {
  const parsed = customerCancelSchema.parse(input), session = await validateCustomerSession(rawToken), code = orderCodeSchema.parse(codeInput);
  await limitPaymentRequests(session.id, "initiate");
  const order = await prisma.order.findFirst({ where: { customerSessionId: session.id, publicOrderCode: code }, select: { id: true } });
  if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found for this seat session.");
  const result = await cancelOrderRecord(order.id, { type: "CUSTOMER", sessionId: session.id }, { reasonCode: "CUSTOMER_REQUEST", reasonNote: parsed.reasonNote });
  await recoverOrder(order.id);
  return result;
}
export async function adminFinancial(orderIdInput: string) {
  const actor = requireScheduleActor(await getCurrentUser()), id = documentIdSchema.parse(orderIdInput);
  await serial(async tx => {
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found.");
    await authorizeOrderStaff(tx, actor, order);
  });
  return financialSummaryRecord(id);
}
export async function adminFinancialAction(idInput: string, operation: "cancel" | "refund" | "retry" | "resolve" | "sandbox", input: unknown) {
  const actor = requireScheduleActor(await getCurrentUser()), id = documentIdSchema.parse(idInput);
  if (operation === "cancel") {
    const parsed = cancelSchema.parse(input);
    await cancelOrderRecord(id, { type: "STAFF", user: actor }, parsed);
  } else if (operation === "refund") await createRefundRecord(actor, id, refundSchema.parse(input));
  else if (operation === "retry") {
    const parsed = refundRetrySchema.parse(input);
    await retryRefundRecord(actor, id, parsed.refundId, parsed.idempotencyKey);
  } else if (operation === "resolve") {
    const parsed = resolveIssueSchema.parse(input);
    await serial(async tx => {
      await lockOrder(tx, id);
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found.");
      const { user } = await authorizeOrderStaff(tx, actor, order);
      const issue = await tx.orderIssue.findFirst({ where: { id: parsed.issueId, orderId: id } });
      if (!issue) throw new ServiceError("ORDER_ISSUE_NOT_FOUND", 404, "Issue not found.");
      if (issue.status === "RESOLVED") return;
      await tx.orderIssue.update({ where: { id: issue.id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedByUserId: user.id, resolution: parsed.resolution } });
      await tx.auditLog.create({ data: { action: "ORDER_ISSUE_RESOLVED", entityType: "ORDER", entityId: id,
        actorUserId: user.id, organizationId: order.organizationId, locationId: order.locationId, metadata: { issueId: issue.id } } });
    });
  } else {
    paymentConfig();
    await adminFinancial(id);
    const parsed = z.object({ refundId: z.string().min(1).max(150), outcome: z.enum(["SUCCEEDED", "FAILED"]), confirmed: z.literal(true) }).strict().parse(input);
    const refund = await prisma.refund.findFirst({ where: { id: parsed.refundId, orderId: id, status: { in: ["PENDING", "PROCESSING"] } } });
    if (!refund?.providerRefundId) throw new ServiceError("REFUND_NOT_ELIGIBLE", 409, "No active sandbox refund.");
    await prisma.sandboxRefundIntent.updateMany({ where: { id: refund.providerRefundId, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: parsed.outcome } });
    const result = await getPaymentProvider().retrieveRefund(refund.providerRefundId);
    const raw = JSON.stringify({ ...result, kind: "refund", eventId: `sandbox-refund:${randomUUID()}` });
    await receivePaymentWebhook(raw, sandboxSignature(raw));
  }
  await recoverOrder(id);
  return adminFinancial(id);
}
export async function screeningFinancialAction(idInput: string, confirmed = false, reviewedOrderIds: readonly string[] = []) {
  const actor = requireScheduleActor(await getCurrentUser()), id = documentIdSchema.parse(idInput);
  if (!confirmed) return screeningReconciliationPreview(actor, id);
  const result = await reconcileScreeningOrders(actor, id, reviewedOrderIds);
  const orders = await prisma.order.findMany({ where: { screeningId: id, status: "CANCELED" }, select: { id: true }, take: 100 });
  for (const order of orders) await recoverOrder(order.id);
  return result;
}
export async function reportOrderIssue(codeInput: string, input: unknown) {
  const actor = await getCurrentUser();
  if (!actor) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Staff sign-in required.");
  const code = orderCodeSchema.parse(codeInput), parsed = issueSchema.parse(input);
  return serial(async tx => {
    const found = await tx.order.findFirst({ where: { publicOrderCode: code, organizationId: actor.organizationId ?? "" } });
    if (!found) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found.");
    await lockOrder(tx, found.id);
    const order = await tx.order.findUniqueOrThrow({ where: { id: found.id } });
    const { user, grant } = await authorizeOrderStaff(tx, actor, order, false);
    if (grant.role === "DELIVERY_STAFF" && (order.status !== "OUT_FOR_DELIVERY" || order.deliveryAssignedUserId !== user.id)) throw new ServiceError("AUTHORIZATION_DENIED", 403, "Only your assigned active delivery can report an issue.");
    if (grant.role === "KITCHEN_STAFF" && (!["PLACED", "ACCEPTED", "PREPARING", "READY"].includes(order.status)
      || !["ITEM_MISSING", "ORDER_DAMAGED", "OTHER"].includes(parsed.type))) throw new ServiceError("AUTHORIZATION_DENIED", 403, "This kitchen issue is not permitted.");
    const issue = await tx.orderIssue.create({ data: { orderId: order.id, type: parsed.type, note: parsed.note || null, reportedByUserId: user.id } });
    await tx.auditLog.create({ data: { action: "ORDER_ISSUE_REPORTED", entityType: "ORDER", entityId: order.id,
      actorUserId: user.id, organizationId: order.organizationId, locationId: order.locationId, metadata: { issueId: issue.id, type: issue.type } } });
    return { id: issue.id, status: issue.status };
  });
}
