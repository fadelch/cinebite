import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type CancellationReason } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { customerMayCancel, staffMayCancel } from "@/lib/payments/refund-policy";
import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";
import { requestProviderCancellation, serial } from "./payment.repository";
import { settleReservations } from "./payment-inventory";
import { createSystemIssue, stageRefund } from "./refund-domain";

export type CancellationActor = { type: "CUSTOMER"; sessionId: string } | { type: "STAFF"; user: AuthenticatedUser } | { type: "SYSTEM"; screeningId: string; requestedBy: AuthenticatedUser };

// Re-read active PostgreSQL grants inside each write, not just from the cookie.
export async function authorizeOrderStaff(tx: Prisma.TransactionClient, actor: AuthenticatedUser, order: { organizationId: string; locationId: string }, financial = true) {
  const user = await tx.user.findUnique({ where: { firebaseUid: actor.uid }, include: { memberships: {
    where: { organizationId: order.organizationId }, include: { organization: true, locationAccess: true } } } });
  const grant = user?.memberships[0];
  if (!user?.active || actor.organizationId !== order.organizationId || !grant || grant.organization.status !== "ACTIVE") throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found in your permitted locations.");
  if (financial && !["CINEMA_ADMIN", "LOCATION_MANAGER"].includes(grant.role)) throw new ServiceError("AUTHORIZATION_DENIED", 403, "Financial actions require a cinema administrator or location manager.");
  if (grant.role !== "CINEMA_ADMIN" && !grant.allLocations && !grant.locationAccess.some(g => g.locationId === order.locationId)) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found in your permitted locations.");
  return { user, grant };
}
export async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM payments WHERE "orderId" = ${id} FOR UPDATE`);
}

export async function cancelOrderRecord(orderId: string, actor: CancellationActor, input: {
  reasonCode: CancellationReason; reasonNote?: string; exceptional?: boolean;
}) {
  return serial(async tx => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { payment: { include: { attempts: true } }, cancellation: true, customerSession: true, screening: true } });
    if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found.");
    let actorUserId: string | undefined, requestedByUserId: string | undefined;
    if (actor.type === "CUSTOMER") {
      if (order.customerSessionId !== actor.sessionId) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found for this seat session.");
      if (order.customerSession.status !== "ACTIVE" || order.customerSession.expiresAt <= new Date()) throw new ServiceError("CUSTOMER_SESSION_EXPIRED", 401, "This seat session has ended.");
    } else if (actor.type === "STAFF") actorUserId = (await authorizeOrderStaff(tx, actor.user, order)).user.id;
    else {
      if (order.screeningId !== actor.screeningId || order.screening.status !== "CANCELLED") throw new ServiceError("SCREENING_NOT_FOUND", 404, "Canceled screening not found.");
      requestedByUserId = (await authorizeOrderStaff(tx, actor.requestedBy, order)).user.id;
    }
    if (order.status === "CANCELED" && order.cancellation) return { canceled: true, replayed: true, orderId };
    if (actor.type === "CUSTOMER" ? !customerMayCancel(order.status) : !staffMayCancel(order.status, actor.type === "STAFF" && input.exceptional === true)) throw new ServiceError("TOO_LATE_TO_CANCEL", 409, "Too late to cancel. Please ask a supervisor for help.");
    const payment = order.payment;
    let disposition: "NONE" | "RESERVATION_RELEASED" | "HOLD_UNTIL_PROVIDER_FINAL" | "AUTO_RESTOCKED" | "NO_AUTO_RESTOCK" = "NONE";
    if (payment) {
      if (payment.status === "SUCCEEDED") {
        await stageRefund(tx, { payment, key: `cancel:${order.id}`, reasonCode: input.reasonCode, reasonNote: input.reasonNote, actorType: actor.type, actorUserId, allowEmpty: true });
      } else {
        for (const attempt of payment.attempts) {
          if (["PENDING", "PROCESSING"].includes(attempt.status)) {
            // Stop fulfillment immediately, but retain promised stock until a
            // verified provider terminal result. Never falsely claim money canceled.
            await requestProviderCancellation(tx, attempt.id);
            disposition = "HOLD_UNTIL_PROVIDER_FINAL";
          } else await settleReservations(tx, order, attempt.id, "RELEASED", new Date());
        }
        if (disposition === "NONE") disposition = "RESERVATION_RELEASED";
      }
    }
    if (order.status === "PLACED") {
      // Immutable original consumption, NEVER today's recipe.
      const movements = await tx.inventoryMovement.findMany({ where: { orderId, type: "ORDER_CONSUMPTION" }, orderBy: { locationInventoryId: "asc" } });
      for (const movement of movements) {
        const quantity = movement.quantityDelta.negated();
        if (quantity.lte(0)) throw new ServiceError("REFUND_CONFLICT", 409, "Original consumption needs review.");
        await tx.locationInventory.update({ where: { id: movement.locationInventoryId }, data: { quantityOnHand: { increment: quantity } } });
        await tx.inventoryMovement.create({ data: { organizationId: order.organizationId, locationInventoryId: movement.locationInventoryId,
          type: "ORDER_CANCELLATION_RESTOCK", quantityDelta: quantity, orderId, actorUserId, reason: "Canceled before kitchen acceptance" } });
      }
      if (movements.length) {
        disposition = "AUTO_RESTOCKED";
        await tx.auditLog.create({ data: { action: "INVENTORY_RESTORED_FOR_CANCELLATION", entityType: "ORDER", entityId: orderId,
          actorUserId, organizationId: order.organizationId, locationId: order.locationId, metadata: { originalMovementCount: movements.length } } });
      }
    } else disposition = "NO_AUTO_RESTOCK";
    await tx.orderCancellation.create({ data: { id: randomUUID(), orderId, fromStatus: order.status, initiatedByType: actor.type,
      initiatedByUserId: actorUserId, reasonCode: input.reasonCode, reasonNote: input.reasonNote || null, inventoryDisposition: disposition } });
    const changed = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { status: "CANCELED", fulfillmentEligible: false } });
    if (changed.count !== 1) throw new ServiceError("TOO_LATE_TO_CANCEL", 409, "This order has changed. Please refresh.");
    await tx.orderStatusEvent.create({ data: { orderId, fromStatus: order.status, toStatus: "CANCELED", actorType: actor.type, actorUserId } });
    await tx.auditLog.create({ data: { action: "ORDER_CANCELED", entityType: "ORDER", entityId: orderId, actorUserId,
      organizationId: order.organizationId, locationId: order.locationId, metadata: { fromStatus: order.status, reasonCode: input.reasonCode, inventoryDisposition: disposition } } });
    if (actor.type === "SYSTEM") await tx.auditLog.create({ data: { action: "SCREENING_ORDER_RECONCILED", entityType: "ORDER", entityId: orderId, actorUserId: requestedByUserId,
      organizationId: order.organizationId, locationId: order.locationId, metadata: { classification: "PLACED_CANCELED", screeningId: actor.screeningId } } });
    return { canceled: true, replayed: false, orderId };
  });
}

export async function screeningReconciliationPreview(actor: AuthenticatedUser, screeningId: string) {
  return serial(async tx => {
    const screening = await tx.screening.findUnique({ where: { id: screeningId }, include: { hall: { include: { location: true } } } });
    if (!screening || screening.status !== "CANCELLED") throw new ServiceError("SCREENING_NOT_FOUND", 404, "Canceled screening not found.");
    await authorizeOrderStaff(tx, actor, { organizationId: screening.hall.location.organizationId, locationId: screening.hall.location.id });
    const orders = await tx.order.findMany({ where: screeningActionableWhere(screeningId), select: { id: true, status: true, payment: { select: { status: true } } }, orderBy: { id: "asc" }, take: 101 });
    const batch = orders.slice(0, 100);
    const preserved = await tx.order.groupBy({ by: ["status"], where: { screeningId, status: { in: ["DELIVERED", "CANCELED"] } }, _count: { _all: true } });
    return { screeningId, batchLimit: 100, more: orders.length > 100, batchOrderIds: batch.map(o => o.id), counts: {
      unpaidPlaced: batch.filter(o => o.status === "PLACED" && o.payment?.status !== "SUCCEEDED").length,
      paidPlaced: batch.filter(o => o.status === "PLACED" && o.payment?.status === "SUCCEEDED").length,
      started: batch.filter(o => ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(o.status)).length,
      delivered: preserved.find(g => g.status === "DELIVERED")?._count._all ?? 0, canceled: preserved.find(g => g.status === "CANCELED")?._count._all ?? 0 } };
  });
}
function screeningActionableWhere(screeningId: string): Prisma.OrderWhereInput {
  return { screeningId, OR: [{ status: "PLACED" },
    { status: { in: ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] }, issues: { none: { deduplicationKey: { startsWith: `screening:${screeningId}:` } } } }] };
}
export async function reconcileScreeningOrders(actor: AuthenticatedUser, screeningId: string, reviewedOrderIds: readonly string[]) {
  await screeningReconciliationPreview(actor, screeningId);
  // Bounded, resumable: canceled/delivered and already-classified rows never
  // starve the next batch; no provider calls inside the database transaction.
  const orders = await prisma.order.findMany({ where: { screeningId, id: { in: [...reviewedOrderIds] } }, orderBy: { id: "asc" }, take: 100 });
  let canceled = 0, issues = 0;
  for (const candidate of orders) {
    await serial(async tx => {
      await lockOrder(tx, candidate.id);
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: candidate.id } });
      await authorizeOrderStaff(tx, actor, fresh);
      if (["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(fresh.status)) {
        await createSystemIssue(tx, fresh.id, "SCREENING_CANCELED", `screening:${screeningId}:${fresh.id}`, "Screening canceled. Supervisor must decide how to handle this started order; no automatic restock or refund.");
      }
    });
    try {
      if (candidate.status === "PLACED") { await cancelOrderRecord(candidate.id, { type: "SYSTEM", screeningId, requestedBy: actor }, { reasonCode: "SCREENING_CANCELED" }); canceled++; }
      else if (["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(candidate.status)) issues++;
    } catch (error) {
      // Kitchen may have won the race. Reclassify instead of mass-canceling food.
      if (!(error instanceof ServiceError) || error.code !== "TOO_LATE_TO_CANCEL") throw error;
      await serial(async tx => {
        await lockOrder(tx, candidate.id);
        const fresh = await tx.order.findUniqueOrThrow({ where: { id: candidate.id } });
        await authorizeOrderStaff(tx, actor, fresh);
        if (["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(fresh.status)) await createSystemIssue(tx, candidate.id, "SCREENING_CANCELED", `screening:${screeningId}:${candidate.id}`, "Screening canceled while fulfillment began. Supervisor review required.");
      }); issues++;
    }
  }
  return { canceled, issues, batchLimit: 100, preview: await screeningReconciliationPreview(actor, screeningId) };
}
