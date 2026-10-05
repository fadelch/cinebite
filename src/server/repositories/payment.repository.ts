import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isPrismaError, isRetryableTransactionError } from "@/lib/db/errors";
import { aggregateRecipeRequirements } from "@/lib/orders/calculations";
import { paymentConfig } from "@/lib/payments/config";
import { canAdvancePayment, paymentMinorUnits } from "@/lib/payments/policy";
import { getPaymentProvider, type ProviderEvent } from "@/lib/payments/provider";
import { orderDto, orderInclude } from "./order.repository";
import { reserveInventory, settleReservations } from "./payment-inventory";
import { ServiceError } from "@/server/services/service-error";

async function serial<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry++) {
    try { return await prisma.$transaction(operation, { isolationLevel: "Serializable", timeout: 15000 }); }
    catch (error) {
      if (retry < 4 && (isRetryableTransactionError(error) || isPrismaError(error, "P2002"))) continue;
      if (isRetryableTransactionError(error)) throw new ServiceError("PAYMENT_CONFLICT", 409, "Payment is being updated. Please try again.");
      throw error;
    }
  }
}
async function lockPayment(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM payments WHERE id = ${id} FOR UPDATE`);
}
function eligibleContext(order: { screening: { status: string; startsAt: Date; endsAt: Date }; customerSession: { status: string; expiresAt: Date };
  seat: { status: string }; hall: { status: string }; location: { status: string }; organization: { status: string } }, now: Date) {
  return order.screening.status === "SCHEDULED" && order.screening.startsAt <= now && order.screening.endsAt > now
    && order.customerSession.status === "ACTIVE" && order.customerSession.expiresAt > now && order.seat.status === "ACTIVE"
    && order.hall.status === "ACTIVE" && order.location.status === "ACTIVE" && order.organization.status === "ACTIVE";
}
const contextInclude = { screening: true, customerSession: true, seat: true, hall: true, location: true, organization: true } as const;

// PostgreSQL fixed-window limits work across serverless instances; no in-memory authority.
export async function limitPaymentRequests(sessionId: string, operation: "initiate" | "status") {
  const limit = operation === "status" ? 90 : 12;
  const window = Math.floor(Date.now() / 60000);
  const key = `${operation}:${sessionId}:${window}`;
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    INSERT INTO payment_rate_limits (key, count, "expiresAt") VALUES (${key}, 1, NOW() + INTERVAL '2 minutes')
    ON CONFLICT (key) DO UPDATE SET count = payment_rate_limits.count + 1 RETURNING count`);
  if (rows[0].count > limit) throw new ServiceError("PAYMENT_RATE_LIMITED", 429, "Please wait a minute before trying again.");
}

export async function getOwnedPayment(sessionId: string, publicCode: string) {
  const row = await prisma.payment.findFirst({ where: { order: { customerSessionId: sessionId, publicOrderCode: publicCode } },
    include: { order: { include: orderInclude }, attempts: { orderBy: { number: "desc" }, take: 1 } } });
  if (!row) throw new ServiceError("PAYMENT_NOT_FOUND", 404, "Payment not found for this seat session.");
  const attempt = row.attempts[0];
  return { order: orderDto(row.order), status: row.status, provider: row.provider, sandbox: true,
    reviewRequired: row.reviewRequired, attemptCount: row.currentAttemptNumber, expiresAt: attempt.expiresAt.toISOString(),
    canRetry: ["FAILED", "CANCELED"].includes(row.status) && !row.reviewRequired,
    canPay: ["PENDING", "PROCESSING"].includes(row.status) && !row.reviewRequired && attempt.expiresAt > new Date(),
    succeededAt: row.succeededAt?.toISOString() ?? null };
}

// Recoverable external boundary: durable attempt first, provider idempotency second,
// bind third. A crash between 2/3 is recovered by the SAME attempt id on the next request.
export async function initializeProviderPayment(sessionId: string, publicCode: string) {
  const payment = await prisma.payment.findFirst({ where: { order: { customerSessionId: sessionId, publicOrderCode: publicCode } },
    include: { attempts: { orderBy: { number: "desc" }, take: 1 } } });
  if (!payment) throw new ServiceError("PAYMENT_NOT_FOUND", 404, "Payment not found.");
  const attempt = payment.attempts[0];
  if (!["PENDING", "PROCESSING"].includes(attempt.status) || payment.reviewRequired) return;
  const provider = getPaymentProvider();
  const intent = attempt.providerPaymentId ? await provider.retrieve(attempt.providerPaymentId)
    : await provider.create({ attemptId: attempt.id, amountMinor: paymentMinorUnits(payment.amount.toFixed(2), payment.currencyCode), currencyCode: payment.currencyCode, expiresAt: attempt.expiresAt });
  if (!attempt.providerPaymentId) await serial(async (tx) => {
    await lockPayment(tx, payment.id);
    await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { providerPaymentId: intent.providerPaymentId } });
    await tx.payment.updateMany({ where: { id: payment.id, currentAttemptNumber: attempt.number }, data: { providerPaymentId: intent.providerPaymentId } });
  });
  const fresh = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  if (fresh.status === "CANCELED" && intent.status !== "SUCCEEDED") await provider.cancel(intent.providerPaymentId);
  if (intent.status !== "PENDING") await processVerifiedPaymentEvent({ ...intent, eventId: `retrieval:${intent.providerPaymentId}:${intent.status}` });
}

export async function retryPaymentRecord(sessionId: string, publicCode: string, key: string, now = new Date()) {
  return serial(async (tx) => {
    const found = await tx.payment.findFirst({ where: { order: { customerSessionId: sessionId, publicOrderCode: publicCode } } });
    if (!found) throw new ServiceError("PAYMENT_NOT_FOUND", 404, "Payment not found.");
    await lockPayment(tx, found.id);
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: found.id }, include: { order: { include: { ...contextInclude,
      items: { include: { product: { include: { category: true, productLocations: true, recipeComponents: { include: { inventoryItem: true } } } } } } } } } });
    const replay = await tx.paymentAttempt.findUnique({ where: { paymentId_idempotencyKey: { paymentId: payment.id, idempotencyKey: key } } });
    if (replay) return;
    if (!["FAILED", "CANCELED"].includes(payment.status) || payment.reviewRequired || payment.order.fulfillmentEligible) throw new ServiceError("PAYMENT_CONFLICT", 409, "This payment cannot be restarted.");
    if (!eligibleContext(payment.order, now)) throw new ServiceError("PAYMENT_NOT_ELIGIBLE", 409, "This screening is no longer accepting payments.");
    for (const line of payment.order.items) {
      const offer = line.product.productLocations.find((offer) => offer.locationId === payment.order.locationId);
      if (line.product.status !== "ACTIVE" || line.product.category.status !== "ACTIVE" || !offer?.isAvailable
        || line.product.recipeComponents.some((c) => c.inventoryItem.status !== "ACTIVE")) throw new ServiceError("PRODUCT_UNAVAILABLE", 409, "An item is no longer available.");
      if (!offer.price.equals(line.unitPrice) || offer.currencyCode !== line.currencyCode) throw new ServiceError("PRICE_CHANGED", 409, "Prices changed. Start a new cart after reviewing the menu.");
    }
    const requirements = aggregateRecipeRequirements(payment.order.items.map((line) => ({ quantity: line.quantity,
      recipe: line.product.recipeComponents.map((c) => ({ inventoryItemId: c.inventoryItemId, quantityRequired: c.quantityRequired.toFixed(3) })) })));
    const expiresAt = new Date(Math.min(now.getTime() + paymentConfig().minutes * 60000, payment.order.screening.endsAt.getTime(), payment.order.customerSession.expiresAt.getTime()));
    const attempt = await tx.paymentAttempt.create({ data: { id: randomUUID(), paymentId: payment.id, number: payment.currentAttemptNumber + 1, idempotencyKey: key, expiresAt } });
    await reserveInventory(tx, { orderId: payment.orderId, attemptId: attempt.id, organizationId: payment.order.organizationId,
      locationId: payment.order.locationId, requirements, expiresAt });
    await tx.payment.update({ where: { id: payment.id }, data: { status: "PENDING", currentAttemptNumber: attempt.number, providerPaymentId: null, failedAt: null, canceledAt: null } });
    for (const action of ["PAYMENT_CREATED", ...(requirements.size ? ["INVENTORY_RESERVED" as const] : [])] as const) await tx.auditLog.create({ data: {
      action, entityType: "ORDER", entityId: payment.orderId, organizationId: payment.order.organizationId,
      locationId: payment.order.locationId, metadata: { attemptNumber: attempt.number, provider: "sandbox" },
    } });
  });
}

// Only call with a verified signature or trusted server-to-server provider result.
// A browser success return NEVER enters this function.
export async function processVerifiedPaymentEvent(event: ProviderEvent, now = new Date()): Promise<{ status: string; duplicate?: boolean; cancellationAttemptId?: string }> {
  return serial(async (tx) => {
    const existing = await tx.paymentWebhookEvent.findUnique({ where: { provider_providerEventId: { provider: "sandbox", providerEventId: event.eventId } } });
    if (existing) return { duplicate: true, status: existing.status };
    const attempt = await tx.paymentAttempt.findUnique({ where: { id: event.attemptId } });
    const journal = { provider: "sandbox", providerEventId: event.eventId, eventType: event.status, processedAt: now };
    if (!attempt) {
      await tx.paymentWebhookEvent.create({ data: { ...journal, status: "REJECTED", failureCode: "UNKNOWN_ATTEMPT" } });
      return { status: "REJECTED" };
    }
    await lockPayment(tx, attempt.paymentId);
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: attempt.paymentId }, include: { order: { include: contextInclude } } });
    const currentAttempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    let anomaly: string | null = null;
    if (payment.provider !== "sandbox") anomaly = "PROVIDER_MISMATCH";
    else if (currentAttempt.providerPaymentId !== event.providerPaymentId) anomaly = "PROVIDER_ID_MISMATCH";
    else if (paymentMinorUnits(payment.amount.toFixed(2), payment.currencyCode) !== event.amountMinor || !payment.amount.equals(payment.order.total)) anomaly = "AMOUNT_MISMATCH";
    else if (payment.currencyCode !== event.currencyCode || payment.currencyCode !== payment.order.currencyCode) anomaly = "CURRENCY_MISMATCH";
    if (anomaly) {
      await tx.paymentWebhookEvent.create({ data: { ...journal, status: "REJECTED", failureCode: anomaly } });
      // A bogus/mismatched event cannot change stock, success or eligibility.
      return { status: "REJECTED" };
    }
    if (payment.status === "SUCCEEDED") {
      await tx.paymentWebhookEvent.create({ data: { ...journal, status: "IGNORED", failureCode: event.status === "SUCCEEDED" && currentAttempt.status !== "SUCCEEDED" ? "SECOND_SETTLEMENT_REVIEW" : "TERMINAL_SUCCESS" } });
      if (event.status === "SUCCEEDED" && currentAttempt.status !== "SUCCEEDED") await tx.auditLog.create({ data: {
        action: "PAYMENT_REVIEW_REQUIRED", entityType: "ORDER", entityId: payment.orderId, organizationId: payment.order.organizationId,
        locationId: payment.order.locationId, metadata: { reason: "SECOND_SETTLEMENT_REVIEW", attemptNumber: currentAttempt.number },
      } });
      return { status: "IGNORED" };
    }
    const isCurrent = currentAttempt.number === payment.currentAttemptNumber;
    const viable = isCurrent && currentAttempt.expiresAt > now && eligibleContext(payment.order, now)
      && canAdvancePayment(currentAttempt.status, event.status) && !payment.reviewRequired;
    if (event.status === "PROCESSING" && isCurrent && !viable && canAdvancePayment(currentAttempt.status, event.status)) {
      await settleReservations(tx, payment.order, currentAttempt.id, "EXPIRED", now);
      await tx.paymentAttempt.update({ where: { id: currentAttempt.id }, data: { status: "CANCELED", canceledAt: now } });
      await requestProviderCancellation(tx, currentAttempt.id);
      await tx.payment.update({ where: { id: payment.id }, data: { status: "CANCELED", canceledAt: now } });
      await tx.auditLog.create({ data: { action: "PAYMENT_CANCELED", entityType: "ORDER", entityId: payment.orderId,
        organizationId: payment.order.organizationId, locationId: payment.order.locationId, metadata: { reason: "PROCESSING_AFTER_ELIGIBILITY_CLOSED" } } });
      await tx.paymentWebhookEvent.create({ data: { ...journal, status: "IGNORED", failureCode: "ELIGIBILITY_CLOSED" } });
      return { status: "IGNORED", cancellationAttemptId: currentAttempt.id };
    }
    if (event.status === "SUCCEEDED" && !viable) {
      // Record actual financial truth, but NEVER re-reserve/oversell or send to kitchen.
      await settleReservations(tx, payment.order, currentAttempt.id, "EXPIRED", now);
      let cancellationAttemptId: string | undefined;
      if (!isCurrent) {
        const newer = await tx.paymentAttempt.findUniqueOrThrow({ where: { paymentId_number: { paymentId: payment.id, number: payment.currentAttemptNumber } } });
        await settleReservations(tx, payment.order, newer.id, "RELEASED", now);
        await tx.paymentAttempt.updateMany({ where: { id: newer.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "CANCELED", canceledAt: now } });
        await requestProviderCancellation(tx, newer.id);
        cancellationAttemptId = newer.id;
      }
      await tx.paymentAttempt.update({ where: { id: currentAttempt.id }, data: { status: "SUCCEEDED", succeededAt: now } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED", providerPaymentId: event.providerPaymentId, succeededAt: now, reviewRequired: true, reviewReason: "LATE_OR_INELIGIBLE_SUCCESS" } });
      await tx.auditLog.create({ data: { action: "PAYMENT_REVIEW_REQUIRED", entityType: "ORDER", entityId: payment.orderId,
        organizationId: payment.order.organizationId, locationId: payment.order.locationId, metadata: { reason: "LATE_OR_INELIGIBLE_SUCCESS" } } });
      await tx.paymentWebhookEvent.create({ data: { ...journal, status: "REVIEW", failureCode: "LATE_OR_INELIGIBLE_SUCCESS" } });
      return { status: "REVIEW", cancellationAttemptId };
    }
    if (!isCurrent || !canAdvancePayment(currentAttempt.status, event.status)) {
      await tx.paymentWebhookEvent.create({ data: { ...journal, status: "IGNORED", failureCode: "STALE_STATE" } }); return { status: "IGNORED" };
    }
    const times = event.status === "SUCCEEDED" ? { succeededAt: now } : event.status === "FAILED" ? { failedAt: now } : event.status === "CANCELED" ? { canceledAt: now } : {};
    await tx.paymentAttempt.update({ where: { id: currentAttempt.id }, data: { status: event.status, ...times } });
    await tx.payment.update({ where: { id: payment.id }, data: { status: event.status, ...times } });
    if (event.status === "SUCCEEDED") {
      await settleReservations(tx, payment.order, currentAttempt.id, "CONSUMED", now);
      await tx.order.update({ where: { id: payment.orderId }, data: { fulfillmentEligible: true } });
    } else if (["FAILED", "CANCELED"].includes(event.status)) await settleReservations(tx, payment.order, currentAttempt.id, "RELEASED", now);
    if (["SUCCEEDED", "FAILED", "CANCELED"].includes(event.status)) await tx.auditLog.create({ data: {
      action: event.status === "SUCCEEDED" ? "PAYMENT_SUCCEEDED" : event.status === "FAILED" ? "PAYMENT_FAILED" : "PAYMENT_CANCELED",
      entityType: "ORDER", entityId: payment.orderId, organizationId: payment.order.organizationId, locationId: payment.order.locationId,
      metadata: { provider: "sandbox", amount: payment.amount.toFixed(2), currencyCode: payment.currencyCode, attemptNumber: currentAttempt.number },
    } });
    await tx.paymentWebhookEvent.create({ data: { ...journal, status: "PROCESSED" } });
    return { status: "PROCESSED" };
  });
}

// Durable sweep: deployment cron + opportunistic before checkout/status/retry.
export async function expirePaymentReservations(now = new Date()) {
  const candidates = await prisma.paymentAttempt.findMany({ where: { status: { in: ["PENDING", "PROCESSING"] }, OR: [
    { expiresAt: { lte: now } }, { payment: { order: { screening: { OR: [{ status: "CANCELLED" }, { endsAt: { lte: now } }] } } } },
  ] }, orderBy: { expiresAt: "asc" }, take: 100 });
  let expired = 0;
  for (const candidate of candidates) {
    const expiredAttempt = await serial(async (tx) => {
      await lockPayment(tx, candidate.paymentId);
      const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: candidate.id }, include: { payment: { include: { order: { include: contextInclude } } } } });
      if (!["PENDING", "PROCESSING"].includes(attempt.status) || (attempt.expiresAt > now && eligibleContext(attempt.payment.order, now))) return null;
      await settleReservations(tx, attempt.payment.order, attempt.id, "EXPIRED", now);
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "CANCELED", canceledAt: now } });
      await requestProviderCancellation(tx, attempt.id);
      if (attempt.payment.status !== "SUCCEEDED" && attempt.number === attempt.payment.currentAttemptNumber) await tx.payment.update({ where: { id: attempt.payment.id }, data: { status: "CANCELED", canceledAt: now } });
      await tx.auditLog.create({ data: { action: "PAYMENT_CANCELED", entityType: "ORDER", entityId: attempt.payment.orderId,
        organizationId: attempt.payment.order.organizationId, locationId: attempt.payment.order.locationId, metadata: { reason: "EXPIRED_OR_SCREENING_CLOSED", attemptNumber: attempt.number } } });
      return true;
    });
    if (expiredAttempt) expired++;
  }
  const cancellation = await drainProviderCancellations(now);
  await prisma.paymentRateLimit.deleteMany({ where: { expiresAt: { lt: now } } });
  return { expired, batchLimit: 100, ...cancellation };
}

// Transactional cancellation outbox reuses the event journal with a distinct
// internal namespace. No external HTTP cancellation is treated as SQL-atomic.
async function requestProviderCancellation(tx: Prisma.TransactionClient, attemptId: string) {
  await tx.paymentWebhookEvent.upsert({ where: { provider_providerEventId: { provider: "sandbox-internal", providerEventId: `cancel:${attemptId}` } },
    create: { provider: "sandbox-internal", providerEventId: `cancel:${attemptId}`, eventType: "CANCELED", status: "CANCEL_PENDING" }, update: {} });
}
export async function drainProviderCancellations(now = new Date(), attemptId?: string) {
  const requests = await prisma.paymentWebhookEvent.findMany({ where: { provider: "sandbox-internal", status: "CANCEL_PENDING", ...(attemptId ? { providerEventId: `cancel:${attemptId}` } : {}) }, orderBy: { receivedAt: "asc" }, take: attemptId ? 1 : 100 });
  for (const request of requests) {
    try {
      const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: request.providerEventId.slice(7) }, include: { payment: true } });
      const provider = getPaymentProvider();
      // Same idempotency key also recovers provider creation that succeeded just
      // before a bind crash. It never creates a second independent charge.
      const intent = attempt.providerPaymentId ? await provider.retrieve(attempt.providerPaymentId) : await provider.create({ attemptId: attempt.id,
        amountMinor: paymentMinorUnits(attempt.payment.amount.toFixed(2), attempt.payment.currencyCode), currencyCode: attempt.payment.currencyCode, expiresAt: attempt.expiresAt });
      if (!attempt.providerPaymentId) await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { providerPaymentId: intent.providerPaymentId } });
      const terminal = await provider.cancel(intent.providerPaymentId);
      if (terminal.status === "SUCCEEDED") await processVerifiedPaymentEvent({ ...terminal, eventId: `cancellation-retrieval:${intent.providerPaymentId}:SUCCEEDED` }, now);
      await prisma.paymentWebhookEvent.updateMany({ where: { id: request.id, status: "CANCEL_PENDING" }, data: { status: "CANCEL_COMPLETE", processedAt: now, failureCode: null } });
    } catch {
      // Durable request is intentionally retained for the next sweep. No raw
      // provider error or secret is logged; scheduler receives the backlog count.
      await prisma.paymentWebhookEvent.updateMany({ where: { id: request.id, status: "CANCEL_PENDING" }, data: { failureCode: "PROVIDER_CANCELLATION_RETRY" } });
    }
  }
  return { cancellationsPending: await prisma.paymentWebhookEvent.count({ where: { provider: "sandbox-internal", status: "CANCEL_PENDING" } }) };
}
