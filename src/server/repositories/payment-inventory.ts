import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { ServiceError } from "@/server/services/service-error";

export async function reserveInventory(tx: Prisma.TransactionClient, input: {
  orderId: string; attemptId: string; organizationId: string; locationId: string; expiresAt: Date; requirements: Map<string, string>;
}) {
  for (const [inventoryItemId, quantity] of [...input.requirements].sort(([a], [b]) => a.localeCompare(b))) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE location_inventory SET "quantityReserved" = "quantityReserved" + ${quantity}::numeric, "updatedAt" = NOW()
      WHERE "organizationId" = ${input.organizationId} AND "locationId" = ${input.locationId} AND "inventoryItemId" = ${inventoryItemId}
      AND "quantityOnHand" - "quantityReserved" >= ${quantity}::numeric RETURNING id`);
    if (rows.length !== 1) throw new ServiceError("INSUFFICIENT_STOCK", 409, "An item just went out of stock. No payment has been taken.");
    await tx.inventoryReservation.create({ data: { id: randomUUID(), orderId: input.orderId, attemptId: input.attemptId,
      locationInventoryId: rows[0].id, quantity, expiresAt: input.expiresAt } });
  }
}

export async function settleReservations(tx: Prisma.TransactionClient, order: { id: string; organizationId: string; locationId: string }, attemptId: string,
  mode: "CONSUMED" | "RELEASED" | "EXPIRED", now: Date) {
  const reservations = await tx.inventoryReservation.findMany({ where: { attemptId, orderId: order.id, status: "ACTIVE" }, orderBy: { locationInventoryId: "asc" } });
  for (const reservation of reservations) {
    const changed = await tx.inventoryReservation.updateMany({ where: { id: reservation.id, status: "ACTIVE" }, data: {
      status: mode, ...(mode === "CONSUMED" ? { consumedAt: now } : { releasedAt: now }),
    } });
    if (changed.count !== 1) continue;
    const stock = await tx.locationInventory.updateMany({ where: { id: reservation.locationInventoryId, organizationId: order.organizationId,
      quantityReserved: { gte: reservation.quantity }, ...(mode === "CONSUMED" ? { quantityOnHand: { gte: reservation.quantity } } : {}) }, data: {
      quantityReserved: { decrement: reservation.quantity }, ...(mode === "CONSUMED" ? { quantityOnHand: { decrement: reservation.quantity } } : {}),
    } });
    if (stock.count !== 1) throw new ServiceError("PAYMENT_CONFLICT", 409, "Inventory settlement needs review.");
    if (mode === "CONSUMED") await tx.inventoryMovement.create({ data: { id: randomUUID(), organizationId: order.organizationId,
      locationInventoryId: reservation.locationInventoryId, type: "ORDER_CONSUMPTION", quantityDelta: reservation.quantity.negated(), orderId: order.id, reason: "Verified payment" } });
  }
  if (reservations.length && mode !== "CONSUMED") await tx.auditLog.create({ data: {
    action: "INVENTORY_RESERVATION_RELEASED", entityType: "ORDER", entityId: order.id, organizationId: order.organizationId, locationId: order.locationId,
    metadata: { reservationCount: reservations.length, reason: mode },
  } });
}
