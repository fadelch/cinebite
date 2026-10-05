import { describe, expect, it } from "vitest";

import { aggregateRecipeRequirements, lineTotal, orderSubtotal } from "@/lib/orders/calculations";

describe("order calculations", () => {
  it("uses exact decimal cents for line totals and subtotal", () => {
    expect(lineTotal("4.00", 3)).toBe("12.00");
    expect(orderSubtotal([{ unitPrice: "0.10", quantity: 3 }, { unitPrice: "4.25", quantity: 2 }])).toBe("8.80");
  });

  it("aggregates shared recipe requirements before stock deduction", () => {
    expect([...aggregateRecipeRequirements([
      { quantity: 2, recipe: [{ inventoryItemId: "corn", quantityRequired: "0.125" }] },
      { quantity: 1, recipe: [{ inventoryItemId: "corn", quantityRequired: "0.500" }, { inventoryItemId: "cup", quantityRequired: "1" }] },
    ])]).toEqual([["corn", "0.750"], ["cup", "1.000"]]);
  });

  it("rejects invalid quantities instead of rounding them", () => {
    expect(() => lineTotal("4.00", 0)).toThrow("Invalid quantity");
    expect(() => lineTotal("4.00", 21)).toThrow("Invalid quantity");
  });
});
