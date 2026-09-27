import { describe, expect, it } from "vitest";

import {
  inventoryItemInputSchema,
  inventoryQuantitySchema,
  positiveInventoryQuantitySchema,
  recipeComponentInputSchema,
  stockMovementInputSchema,
} from "@/validation/inventory";

describe("inventory validation", () => {
  it("normalizes exact decimal quantities without Number conversion", () => {
    expect(inventoryQuantitySchema.parse("004.5")).toBe("4.500");
    expect(inventoryQuantitySchema.parse("4.125")).toBe("4.125");
  });

  it("rejects negative, over-precision, and zero positive quantities", () => {
    expect(() => inventoryQuantitySchema.parse("-1")).toThrow();
    expect(() => inventoryQuantitySchema.parse("1.0001")).toThrow();
    expect(() => positiveInventoryQuantitySchema.parse("0")).toThrow();
  });

  it("normalizes SKU and enforces canonical units", () => {
    expect(inventoryItemInputSchema.parse({ name: "Popcorn kernels", sku: " inv-kernel ", unit: "GRAM", status: "ACTIVE" }).sku).toBe("INV-KERNEL");
    expect(() => inventoryItemInputSchema.parse({ name: "Milk", sku: "MILK", unit: "LITER" })).toThrow();
  });

  it("requires a reason for stock reductions", () => {
    expect(() => stockMovementInputSchema.parse({ type: "WASTE", quantity: "2" })).toThrow();
    expect(stockMovementInputSchema.parse({ type: "ADJUSTMENT_OUT", quantity: "2", reason: "Count correction" }).quantity).toBe("2.000");
  });

  it("requires positive recipe quantities", () => {
    expect(() => recipeComponentInputSchema.parse({ inventoryItemId: "item-1", quantityRequired: "0" })).toThrow();
  });
});
