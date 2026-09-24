import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const transaction = {
    product: { findFirst: vi.fn() },
    inventoryItem: { findFirst: vi.fn() },
    productRecipeComponent: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { prisma: { user: { findUnique: vi.fn() }, $transaction: vi.fn() }, transaction };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database.prisma }));

import { addRecipeComponentRecord } from "@/server/repositories/recipe.repository";

describe("product recipe repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.prisma.user.findUnique.mockResolvedValue({ id: "user-db-1" });
    database.prisma.$transaction.mockImplementation(async (operation: (client: typeof database.transaction) => unknown) => operation(database.transaction));
    database.transaction.product.findFirst.mockResolvedValue({ id: "product-1" });
    database.transaction.inventoryItem.findFirst.mockResolvedValue({ id: "item-1" });
    database.transaction.productRecipeComponent.create.mockResolvedValue({
      id: "component-1", inventoryItemId: "item-1", quantityRequired: { toFixed: () => "150.000" },
      inventoryItem: { name: "Kernels", sku: "INV-KERNEL", unit: "GRAM", status: "ACTIVE" },
    });
  });

  it("creates a same-tenant recipe component and audit event atomically", async () => {
    await addRecipeComponentRecord({ actorUid: "firebase-1", organizationId: "org-1", productId: "product-1", componentId: "component-1", inventoryItemId: "item-1", quantityRequired: "150.000" });
    expect(database.transaction.product.findFirst).toHaveBeenCalledWith({ where: { id: "product-1", organizationId: "org-1" } });
    expect(database.transaction.inventoryItem.findFirst).toHaveBeenCalledWith({ where: { id: "item-1", organizationId: "org-1", status: "ACTIVE" } });
    expect(database.transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "PRODUCT_RECIPE_COMPONENT_ADDED", entityType: "PRODUCT_RECIPE_COMPONENT", organizationId: "org-1" }) });
  });

  it("rejects a cross-tenant or inactive inventory item before recipe creation", async () => {
    database.transaction.inventoryItem.findFirst.mockResolvedValue(null);
    await expect(addRecipeComponentRecord({ actorUid: "firebase-1", organizationId: "org-1", productId: "product-1", componentId: "component-1", inventoryItemId: "foreign-item", quantityRequired: "1.000" })).rejects.toMatchObject({ code: "INVENTORY_ITEM_NOT_FOUND" });
    expect(database.transaction.productRecipeComponent.create).not.toHaveBeenCalled();
  });

  it("maps duplicate product-item components to a friendly conflict", async () => {
    database.transaction.productRecipeComponent.create.mockRejectedValue({ code: "P2002" });
    await expect(addRecipeComponentRecord({ actorUid: "firebase-1", organizationId: "org-1", productId: "product-1", componentId: "component-1", inventoryItemId: "item-1", quantityRequired: "1.000" })).rejects.toMatchObject({ code: "RECIPE_COMPONENT_CONFLICT", status: 409 });
  });
});
