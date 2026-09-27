import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { inventoryActorId } from "@/server/repositories/inventory.repository-utils";
import { ServiceError } from "@/server/services/service-error";
import type { InventoryMovementDto, InventoryMovementType } from "@/types/inventory";
import type { inventoryMovementListQuerySchema } from "@/validation/inventory";

type MovementQuery = ReturnType<typeof inventoryMovementListQuerySchema.parse>;

const movementInclude = {
  actor: { select: { displayName: true } },
  locationInventory: { include: {
    location: { select: { name: true } },
    inventoryItem: { select: { id: true, name: true, unit: true } },
  } },
} as const;

function movementDto(row: {
  id: string; locationInventoryId: string; type: InventoryMovementType;
  quantityDelta: { toFixed(value: number): string }; reason: string | null; note: string | null; createdAt: Date;
  actor: { displayName: string };
  locationInventory: { locationId: string; location: { name: string }; inventoryItem: { id: string; name: string; unit: "EACH" | "GRAM" | "MILLILITER" } };
}): InventoryMovementDto {
  return {
    id: row.id, locationInventoryId: row.locationInventoryId,
    locationId: row.locationInventory.locationId, locationName: row.locationInventory.location.name,
    inventoryItemId: row.locationInventory.inventoryItem.id, itemName: row.locationInventory.inventoryItem.name,
    unit: row.locationInventory.inventoryItem.unit, type: row.type,
    quantityDelta: row.quantityDelta.toFixed(3), reason: row.reason, note: row.note,
    actorDisplayName: row.actor.displayName, createdAt: row.createdAt.toISOString(),
  };
}

const auditAction = {
  RECEIVE: "INVENTORY_STOCK_RECEIVED",
  ADJUSTMENT_IN: "INVENTORY_ADJUSTMENT_IN",
  ADJUSTMENT_OUT: "INVENTORY_ADJUSTMENT_OUT",
  WASTE: "INVENTORY_WASTE_RECORDED",
} as const;

export async function applyStockMovementRecord(input: {
  actorUid: string; organizationId: string; locationId: string; locationInventoryId: string;
  movementId: string; type: InventoryMovementType; quantity: string; reason: string | null; note: string | null;
}) {
  const actorUserId = await inventoryActorId(input.actorUid);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.locationInventory.findFirst({
      where: { id: input.locationInventoryId, organizationId: input.organizationId, locationId: input.locationId },
      include: { inventoryItem: { select: { id: true, name: true, sku: true, unit: true, status: true } } },
    });
    if (!existing) throw new ServiceError("LOCATION_INVENTORY_NOT_FOUND", 404, "Location inventory record not found.");
    const quantity = new Prisma.Decimal(input.quantity);
    const inbound = input.type === "RECEIVE" || input.type === "ADJUSTMENT_IN";
    const updated = await tx.locationInventory.updateMany({
      where: {
        id: existing.id,
        organizationId: input.organizationId,
        ...(inbound ? {} : { quantityOnHand: { gte: quantity } }),
      },
      data: { quantityOnHand: inbound ? { increment: quantity } : { decrement: quantity } },
    });
    if (updated.count !== 1) {
      throw new ServiceError("INSUFFICIENT_STOCK", 409, "Insufficient stock for this adjustment.");
    }
    const refreshed = await tx.locationInventory.findUniqueOrThrow({ where: { id: existing.id } });
    const signedDelta = inbound ? quantity : quantity.negated();
    const movement = await tx.inventoryMovement.create({ data: {
      id: input.movementId, organizationId: input.organizationId, locationInventoryId: existing.id,
      type: input.type, quantityDelta: signedDelta, reason: input.reason, note: input.note, actorUserId,
    }, include: movementInclude });
    await tx.auditLog.create({ data: {
      actorUserId, action: auditAction[input.type], entityType: "INVENTORY_MOVEMENT",
      entityId: movement.id, organizationId: input.organizationId, locationId: input.locationId,
      metadata: {
        locationInventoryId: existing.id, inventoryItemId: existing.inventoryItemId,
        quantityDelta: signedDelta.toFixed(3), resultingQuantity: refreshed.quantityOnHand.toFixed(3),
        reason: input.reason,
      },
    } });
    return { movement: movementDto(movement), quantityOnHand: refreshed.quantityOnHand.toFixed(3) };
  });
}

export async function listInventoryMovementsRecord(organizationId: string, permittedIds: readonly string[] | null, query: MovementQuery) {
  const where = {
    organizationId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    locationInventory: {
      ...(query.locationId ? { locationId: query.locationId } : permittedIds === null ? {} : { locationId: { in: [...permittedIds] } }),
      ...(query.inventoryItemId ? { inventoryItemId: query.inventoryItemId } : {}),
    },
  };
  const [rows, total] = await prisma.$transaction([
    prisma.inventoryMovement.findMany({ where, include: movementInclude, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.inventoryMovement.count({ where }),
  ]);
  return { movements: rows.map(movementDto), total, page: query.page, pageSize: query.pageSize };
}

export { movementDto };
