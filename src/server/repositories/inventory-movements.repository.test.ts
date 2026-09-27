import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const transaction = {
    locationInventory: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: { user: { findUnique: vi.fn() }, $transaction: vi.fn() },
    transaction,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database.prisma }));

import { Prisma } from "@/generated/prisma/client";
import { applyStockMovementRecord } from "@/server/repositories/inventory-movements.repository";

function decimal(value: string) { return new Prisma.Decimal(value); }

describe("atomic inventory stock movements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.prisma.user.findUnique.mockResolvedValue({ id: "user-db-1" });
    database.prisma.$transaction.mockImplementation(async (operation: (client: typeof database.transaction) => unknown) => operation(database.transaction));
    database.transaction.locationInventory.findFirst.mockResolvedValue({
      id: "stock-1", inventoryItemId: "item-1",
      inventoryItem: { id: "item-1", name: "Cups", sku: "INV-CUP", unit: "EACH", status: "ACTIVE" },
    });
    database.transaction.locationInventory.updateMany.mockResolvedValue({ count: 1 });
    database.transaction.locationInventory.findUniqueOrThrow.mockResolvedValue({ quantityOnHand: decimal("12.000") });
    database.transaction.inventoryMovement.create.mockImplementation(async ({ data }: { data: { id: string; type: string; quantityDelta: Prisma.Decimal } }) => ({
      ...data, locationInventoryId: "stock-1", reason: null, note: null, createdAt: new Date(0),
      actor: { displayName: "Manager" },
      locationInventory: { locationId: "loc-1", location: { name: "Downtown" }, inventoryItem: { id: "item-1", name: "Cups", unit: "EACH" } },
    }));
    database.transaction.auditLog.create.mockResolvedValue({});
  });

  it.each([
    ["RECEIVE", "INVENTORY_STOCK_RECEIVED", "increment", "5.000"],
    ["ADJUSTMENT_IN", "INVENTORY_ADJUSTMENT_IN", "increment", "2.000"],
    ["ADJUSTMENT_OUT", "INVENTORY_ADJUSTMENT_OUT", "decrement", "3.000"],
    ["WASTE", "INVENTORY_WASTE_RECORDED", "decrement", "1.000"],
  ] as const)("applies %s, creates an immutable movement, and audits inside one transaction", async (type, action, operation, quantity) => {
    const result = await applyStockMovementRecord({ actorUid: "firebase-1", organizationId: "org-1", locationId: "loc-1", locationInventoryId: "stock-1", movementId: `movement-${type}`, type, quantity, reason: type === "WASTE" ? "Damaged" : null, note: null });
    expect(database.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(database.transaction.locationInventory.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "stock-1", organizationId: "org-1", locationId: "loc-1" } }));
    expect(database.transaction.locationInventory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { quantityOnHand: { [operation]: expect.anything() } },
    }));
    expect(database.transaction.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(database.transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action, entityType: "INVENTORY_MOVEMENT", organizationId: "org-1", locationId: "loc-1" }) });
    expect(result.quantityOnHand).toBe("12.000");
    expect("productLocation" in database.transaction).toBe(false);
  });

  it("uses a conditional atomic decrement and rejects insufficient stock before history writes", async () => {
    database.transaction.locationInventory.updateMany.mockResolvedValue({ count: 0 });
    await expect(applyStockMovementRecord({ actorUid: "firebase-1", organizationId: "org-1", locationId: "loc-1", locationInventoryId: "stock-1", movementId: "movement-1", type: "ADJUSTMENT_OUT", quantity: "20.000", reason: "Count correction", note: null })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", status: 409 });
    expect(database.transaction.locationInventory.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ quantityOnHand: { gte: expect.anything() } }) }));
    expect(database.transaction.inventoryMovement.create).not.toHaveBeenCalled();
    expect(database.transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
