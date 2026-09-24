import "server-only";

import { isPrismaError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { inventoryActorId } from "@/server/repositories/inventory.repository-utils";
import { ServiceError } from "@/server/services/service-error";
import type { RecipeComponentDto } from "@/types/inventory";

const recipeInclude = { inventoryItem: { select: { name: true, sku: true, unit: true, status: true } } } as const;

function recipeDto(row: {
  id: string; inventoryItemId: string; quantityRequired: { toFixed(value: number): string };
  inventoryItem: { name: string; sku: string; unit: "EACH" | "GRAM" | "MILLILITER"; status: "ACTIVE" | "INACTIVE" };
}): RecipeComponentDto {
  return {
    id: row.id, inventoryItemId: row.inventoryItemId, itemName: row.inventoryItem.name,
    sku: row.inventoryItem.sku, unit: row.inventoryItem.unit, status: row.inventoryItem.status,
    quantityRequired: row.quantityRequired.toFixed(3),
  };
}

function mapRecipeError(error: unknown): never {
  if (isPrismaError(error, "P2002")) {
    throw new ServiceError("RECIPE_COMPONENT_CONFLICT", 409, "This product already uses that inventory item.");
  }
  throw error;
}

export async function getProductRecipeRecord(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId }, select: { id: true, name: true, status: true } });
  if (!product) throw new ServiceError("PRODUCT_NOT_FOUND", 404, "Product not found.");
  const components = await prisma.productRecipeComponent.findMany({
    where: { organizationId, productId }, include: recipeInclude, orderBy: { inventoryItem: { name: "asc" } },
  });
  return { product, components: components.map(recipeDto) };
}

export async function addRecipeComponentRecord(input: {
  actorUid: string; organizationId: string; productId: string; componentId: string;
  inventoryItemId: string; quantityRequired: string;
}) {
  const actorUserId = await inventoryActorId(input.actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const [product, item] = await Promise.all([
        tx.product.findFirst({ where: { id: input.productId, organizationId: input.organizationId } }),
        tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, organizationId: input.organizationId, status: "ACTIVE" } }),
      ]);
      if (!product) throw new ServiceError("PRODUCT_NOT_FOUND", 404, "Product not found.");
      if (!item) throw new ServiceError("INVENTORY_ITEM_NOT_FOUND", 404, "Active inventory item not found.");
      const created = await tx.productRecipeComponent.create({ data: {
        id: input.componentId, organizationId: input.organizationId, productId: input.productId,
        inventoryItemId: input.inventoryItemId, quantityRequired: input.quantityRequired,
      }, include: recipeInclude });
      await tx.auditLog.create({ data: {
        actorUserId, action: "PRODUCT_RECIPE_COMPONENT_ADDED", entityType: "PRODUCT_RECIPE_COMPONENT",
        entityId: created.id, organizationId: input.organizationId,
        metadata: { productId: input.productId, inventoryItemId: input.inventoryItemId, quantityRequired: input.quantityRequired },
      } });
      return created;
    });
    return recipeDto(row);
  } catch (error) { mapRecipeError(error); }
}

export async function updateRecipeComponentRecord(input: {
  actorUid: string; organizationId: string; productId: string; componentId: string; quantityRequired: string;
}) {
  const actorUserId = await inventoryActorId(input.actorUid);
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.productRecipeComponent.findFirst({ where: {
      id: input.componentId, organizationId: input.organizationId, productId: input.productId,
    } });
    if (!existing) throw new ServiceError("RECIPE_COMPONENT_NOT_FOUND", 404, "Recipe component not found.");
    const updated = await tx.productRecipeComponent.update({ where: { id: existing.id }, data: { quantityRequired: input.quantityRequired }, include: recipeInclude });
    await tx.auditLog.create({ data: {
      actorUserId, action: "PRODUCT_RECIPE_COMPONENT_UPDATED", entityType: "PRODUCT_RECIPE_COMPONENT",
      entityId: existing.id, organizationId: input.organizationId,
      metadata: { productId: input.productId, previousQuantity: existing.quantityRequired.toFixed(3), quantityRequired: input.quantityRequired },
    } });
    return updated;
  });
  return recipeDto(row);
}

export async function removeRecipeComponentRecord(input: {
  actorUid: string; organizationId: string; productId: string; componentId: string;
}) {
  const actorUserId = await inventoryActorId(input.actorUid);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.productRecipeComponent.findFirst({ where: {
      id: input.componentId, organizationId: input.organizationId, productId: input.productId,
    } });
    if (!existing) throw new ServiceError("RECIPE_COMPONENT_NOT_FOUND", 404, "Recipe component not found.");
    await tx.productRecipeComponent.delete({ where: { id: existing.id } });
    await tx.auditLog.create({ data: {
      actorUserId, action: "PRODUCT_RECIPE_COMPONENT_REMOVED", entityType: "PRODUCT_RECIPE_COMPONENT",
      entityId: existing.id, organizationId: input.organizationId,
      metadata: { productId: input.productId, inventoryItemId: existing.inventoryItemId, quantityRequired: existing.quantityRequired.toFixed(3) },
    } });
  });
  return { removed: true };
}
