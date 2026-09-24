import "server-only";

import { isPrismaError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { computeStockStatus } from "@/lib/inventory/stock-calculations";
import { inventoryActorId } from "@/server/repositories/inventory.repository-utils";
import { ServiceError } from "@/server/services/service-error";
import type { LocationInventoryDto } from "@/types/inventory";

function locationInventoryDto(row: {
  id: string; locationId: string; inventoryItemId: string;
  quantityOnHand: { toFixed(value: number): string };
  lowStockThreshold: { toFixed(value: number): string };
  inventoryItem: { name: string; sku: string; unit: "EACH" | "GRAM" | "MILLILITER"; status: "ACTIVE" | "INACTIVE" };
}): LocationInventoryDto {
  const quantityOnHand = row.quantityOnHand.toFixed(3);
  const lowStockThreshold = row.lowStockThreshold.toFixed(3);
  return {
    id: row.id,
    locationId: row.locationId,
    inventoryItemId: row.inventoryItemId,
    itemName: row.inventoryItem.name,
    sku: row.inventoryItem.sku,
    unit: row.inventoryItem.unit,
    itemStatus: row.inventoryItem.status,
    quantityOnHand,
    lowStockThreshold,
    stockStatus: computeStockStatus(quantityOnHand, lowStockThreshold),
  };
}

const locationInventoryInclude = { inventoryItem: { select: { name: true, sku: true, unit: true, status: true } } } as const;

export async function listInventoryLocationsRecord(organizationId: string, permittedIds: readonly string[] | null) {
  return prisma.location.findMany({
    where: { organizationId, ...(permittedIds === null ? {} : { id: { in: [...permittedIds] } }) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getLocationInventoryRecord(organizationId: string, locationId: string) {
  const location = await prisma.location.findFirst({ where: { id: locationId, organizationId }, select: { id: true, name: true, status: true } });
  if (!location) throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
  const [rows, availableItems] = await Promise.all([
    prisma.locationInventory.findMany({
      where: { organizationId, locationId }, include: locationInventoryInclude,
      orderBy: { inventoryItem: { name: "asc" } },
    }),
    prisma.inventoryItem.findMany({
      where: { organizationId, status: "ACTIVE", locationInventories: { none: { locationId } } },
      select: { id: true, name: true, sku: true, unit: true }, orderBy: { name: "asc" },
    }),
  ]);
  return { location, inventory: rows.map(locationInventoryDto), availableItems };
}

export async function configureLocationInventoryRecord(input: {
  actorUid: string; organizationId: string; locationId: string; id: string;
  inventoryItemId: string; lowStockThreshold: string;
}) {
  const actorUserId = await inventoryActorId(input.actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const [location, item] = await Promise.all([
        tx.location.findFirst({ where: { id: input.locationId, organizationId: input.organizationId } }),
        tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, organizationId: input.organizationId, status: "ACTIVE" } }),
      ]);
      if (!location) throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
      if (!item) throw new ServiceError("INVENTORY_ITEM_NOT_FOUND", 404, "Active inventory item not found.");
      const created = await tx.locationInventory.create({ data: {
        id: input.id, organizationId: input.organizationId, locationId: input.locationId,
        inventoryItemId: input.inventoryItemId, quantityOnHand: "0.000", lowStockThreshold: input.lowStockThreshold,
      }, include: locationInventoryInclude });
      await tx.auditLog.create({ data: {
        actorUserId, action: "LOCATION_INVENTORY_CONFIGURED", entityType: "LOCATION_INVENTORY",
        entityId: input.id, organizationId: input.organizationId, locationId: input.locationId,
        metadata: { inventoryItemId: input.inventoryItemId, lowStockThreshold: input.lowStockThreshold },
      } });
      return created;
    });
    return locationInventoryDto(row);
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new ServiceError("LOCATION_INVENTORY_CONFLICT", 409, "This inventory item already exists at this location.");
    throw error;
  }
}

export async function updateInventoryThresholdRecord(input: {
  actorUid: string; organizationId: string; locationId: string; locationInventoryId: string; lowStockThreshold: string;
}) {
  const actorUserId = await inventoryActorId(input.actorUid);
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.locationInventory.findFirst({
      where: { id: input.locationInventoryId, organizationId: input.organizationId, locationId: input.locationId },
      include: locationInventoryInclude,
    });
    if (!existing) throw new ServiceError("LOCATION_INVENTORY_NOT_FOUND", 404, "Location inventory record not found.");
    const updated = await tx.locationInventory.update({
      where: { id: existing.id }, data: { lowStockThreshold: input.lowStockThreshold }, include: locationInventoryInclude,
    });
    await tx.auditLog.create({ data: {
      actorUserId, action: "INVENTORY_THRESHOLD_CHANGED", entityType: "LOCATION_INVENTORY",
      entityId: existing.id, organizationId: input.organizationId, locationId: input.locationId,
      metadata: { previousThreshold: existing.lowStockThreshold.toFixed(3), lowStockThreshold: input.lowStockThreshold },
    } });
    return updated;
  });
  return locationInventoryDto(row);
}

export async function getInventoryOverviewRecord(organizationId: string, locationId: string) {
  const detail = await getLocationInventoryRecord(organizationId, locationId);
  const recent = await prisma.inventoryMovement.findMany({
    where: { organizationId, locationInventory: { locationId } },
    include: {
      actor: { select: { displayName: true } },
      locationInventory: { include: { location: { select: { name: true } }, inventoryItem: { select: { id: true, name: true, unit: true } } } },
    },
    orderBy: { createdAt: "desc" }, take: 8,
  });
  return { detail, recent };
}

export { locationInventoryDto };
