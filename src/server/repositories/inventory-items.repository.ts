import "server-only";

import { isPrismaError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { inventoryActorId } from "@/server/repositories/inventory.repository-utils";
import { ServiceError } from "@/server/services/service-error";
import type { InventoryItemDto } from "@/types/inventory";
import type {
  inventoryItemInputSchema,
  inventoryItemListQuerySchema,
  inventoryItemUpdateSchema,
} from "@/validation/inventory";

type ItemInput = ReturnType<typeof inventoryItemInputSchema.parse>;
type ItemUpdate = ReturnType<typeof inventoryItemUpdateSchema.parse>;
type ItemQuery = ReturnType<typeof inventoryItemListQuerySchema.parse>;

function itemDto(row: {
  id: string; name: string; sku: string; unit: "EACH" | "GRAM" | "MILLILITER";
  status: "ACTIVE" | "INACTIVE"; updatedAt: Date;
  _count: { locationInventories: number; recipeComponents: number };
}): InventoryItemDto {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    unit: row.unit,
    status: row.status,
    usageLocked: row._count.locationInventories + row._count.recipeComponents > 0,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const usageCount = { select: { locationInventories: true, recipeComponents: true } } as const;

function mapItemError(error: unknown): never {
  if (isPrismaError(error, "P2002")) {
    throw new ServiceError("DUPLICATE_INVENTORY_SKU", 409, "This SKU is already in use.");
  }
  throw error;
}

export async function listInventoryItemsRecord(organizationId: string, query: ItemQuery) {
  const where = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? {
      OR: [
        { name: { contains: query.search, mode: "insensitive" as const } },
        { sku: { contains: query.search, mode: "insensitive" as const } },
      ],
    } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.inventoryItem.findMany({
      where,
      include: { _count: usageCount },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.inventoryItem.count({ where }),
  ]);
  return { items: rows.map(itemDto), total, page: query.page, pageSize: query.pageSize };
}

export async function listActiveInventoryItemsRecord(organizationId: string) {
  const rows = await prisma.inventoryItem.findMany({
    where: { organizationId, status: "ACTIVE" },
    include: { _count: usageCount },
    orderBy: { name: "asc" },
  });
  return rows.map(itemDto);
}

export async function createInventoryItemRecord(actorUid: string, organizationId: string, id: string, input: ItemInput) {
  const actorUserId = await inventoryActorId(actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({ data: { id, organizationId, ...input }, include: { _count: usageCount } });
      await tx.auditLog.create({ data: {
        actorUserId, action: "INVENTORY_ITEM_CREATED", entityType: "INVENTORY_ITEM",
        entityId: id, organizationId, metadata: { sku: input.sku, unit: input.unit },
      } });
      return created;
    });
    return itemDto(row);
  } catch (error) { mapItemError(error); }
}

export async function updateInventoryItemRecord(actorUid: string, organizationId: string, id: string, input: ItemUpdate) {
  const actorUserId = await inventoryActorId(actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryItem.findFirst({
        where: { id, organizationId },
        include: { _count: usageCount },
      });
      if (!existing) throw new ServiceError("INVENTORY_ITEM_NOT_FOUND", 404, "Inventory item not found.");
      if (input.unit && input.unit !== existing.unit &&
        existing._count.locationInventories + existing._count.recipeComponents > 0) {
        throw new ServiceError("INVENTORY_UNIT_LOCKED", 409, "Unit cannot change after stock or recipe usage exists.");
      }
      const updated = await tx.inventoryItem.update({ where: { id }, data: input, include: { _count: usageCount } });
      const action = input.status && input.status !== existing.status
        ? input.status === "ACTIVE" ? "INVENTORY_ITEM_ENABLED" : "INVENTORY_ITEM_DISABLED"
        : "INVENTORY_ITEM_UPDATED";
      await tx.auditLog.create({ data: {
        actorUserId, action, entityType: "INVENTORY_ITEM", entityId: id, organizationId,
        metadata: { changedFields: Object.keys(input) },
      } });
      return updated;
    });
    return itemDto(row);
  } catch (error) { mapItemError(error); }
}
