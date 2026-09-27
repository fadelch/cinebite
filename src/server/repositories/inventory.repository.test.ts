import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const transaction = {
    location: { findFirst: vi.fn() },
    inventoryItem: { findFirst: vi.fn(), create: vi.fn() },
    locationInventory: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      inventoryItem: { findMany: vi.fn(), count: vi.fn() },
      $transaction: vi.fn(),
    },
    transaction,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database.prisma }));

import { createInventoryItemRecord, listInventoryItemsRecord } from "@/server/repositories/inventory-items.repository";
import { configureLocationInventoryRecord } from "@/server/repositories/location-inventory.repository";

const itemRow = {
  id: "item-1", name: "Cups", sku: "INV-CUP", unit: "EACH", status: "ACTIVE",
  updatedAt: new Date(0), _count: { locationInventories: 0, recipeComponents: 0 },
};

describe("inventory repositories enforce tenant boundaries and uniqueness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.prisma.user.findUnique.mockResolvedValue({ id: "user-db-1" });
  });

  it("scopes bounded item searches to the authenticated organization", async () => {
    database.prisma.inventoryItem.findMany.mockReturnValue("find-query");
    database.prisma.inventoryItem.count.mockReturnValue("count-query");
    database.prisma.$transaction.mockResolvedValue([[], 0]);
    await listInventoryItemsRecord("org-1", { search: "cup", status: "ACTIVE", page: 2, pageSize: 24 });
    expect(database.prisma.inventoryItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org-1", status: "ACTIVE" }), skip: 24, take: 24,
    }));
  });

  it("maps organization-scoped duplicate SKU failures to a friendly conflict", async () => {
    database.prisma.$transaction.mockRejectedValue({ code: "P2002" });
    await expect(createInventoryItemRecord("firebase-1", "org-1", "item-1", { name: "Cups", sku: "INV-CUP", unit: "EACH", status: "ACTIVE" })).rejects.toMatchObject({ code: "DUPLICATE_INVENTORY_SKU", status: 409 });
  });

  it("validates both location and item in the same organization before configuration", async () => {
    database.prisma.$transaction.mockImplementation(async (operation: (client: typeof database.transaction) => unknown) => operation(database.transaction));
    database.transaction.location.findFirst.mockResolvedValue({ id: "loc-1" });
    database.transaction.inventoryItem.findFirst.mockResolvedValue(itemRow);
    database.transaction.locationInventory.create.mockResolvedValue({
      id: "stock-1", locationId: "loc-1", inventoryItemId: "item-1", quantityOnHand: { toFixed: () => "0.000" }, lowStockThreshold: { toFixed: () => "5.000" }, inventoryItem: itemRow,
    });
    await configureLocationInventoryRecord({ actorUid: "firebase-1", organizationId: "org-1", locationId: "loc-1", id: "stock-1", inventoryItemId: "item-1", lowStockThreshold: "5.000" });
    expect(database.transaction.location.findFirst).toHaveBeenCalledWith({ where: { id: "loc-1", organizationId: "org-1" } });
    expect(database.transaction.inventoryItem.findFirst).toHaveBeenCalledWith({ where: { id: "item-1", organizationId: "org-1", status: "ACTIVE" } });
    expect(database.transaction.locationInventory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantityOnHand: "0.000" }) }));
  });

  it("rejects cross-tenant item IDs before creating location inventory", async () => {
    database.prisma.$transaction.mockImplementation(async (operation: (client: typeof database.transaction) => unknown) => operation(database.transaction));
    database.transaction.location.findFirst.mockResolvedValue({ id: "loc-1" });
    database.transaction.inventoryItem.findFirst.mockResolvedValue(null);
    await expect(configureLocationInventoryRecord({ actorUid: "firebase-1", organizationId: "org-1", locationId: "loc-1", id: "stock-1", inventoryItemId: "foreign-item", lowStockThreshold: "5.000" })).rejects.toMatchObject({ code: "INVENTORY_ITEM_NOT_FOUND" });
    expect(database.transaction.locationInventory.create).not.toHaveBeenCalled();
  });

  it("maps duplicate location-item rows to an understandable conflict", async () => {
    database.prisma.$transaction.mockRejectedValue({ code: "P2002" });
    await expect(configureLocationInventoryRecord({ actorUid: "firebase-1", organizationId: "org-1", locationId: "loc-1", id: "stock-1", inventoryItemId: "item-1", lowStockThreshold: "5.000" })).rejects.toMatchObject({ code: "LOCATION_INVENTORY_CONFLICT", status: 409 });
  });
});
