import { describe, expect, it } from "vitest";

import {
  computeStockStatus,
  isEffectivelyAvailable,
  projectedProductAvailability,
} from "@/lib/inventory/stock-calculations";

describe("inventory stock calculations", () => {
  it("computes out, low, and in-stock states", () => {
    expect(computeStockStatus("0.000", "5.000")).toBe("OUT_OF_STOCK");
    expect(computeStockStatus("5.000", "5.000")).toBe("LOW_STOCK");
    expect(computeStockStatus("5.001", "5.000")).toBe("IN_STOCK");
  });

  it("uses the limiting recipe component with exact thousandths", () => {
    expect(projectedProductAvailability([
      { quantityOnHand: "5000.000", quantityRequired: "150.000" },
      { quantityOnHand: "30.000", quantityRequired: "1.000" },
    ])).toEqual({ state: "SUFFICIENT", projectedUnits: 30 });
  });

  it("treats products without recipes as NOT_TRACKED", () => {
    expect(projectedProductAvailability([])).toEqual({ state: "NOT_TRACKED", projectedUnits: null });
  });

  it("keeps manual and inventory availability independent and restores after restock", () => {
    expect(isEffectivelyAvailable({ productActive: true, manualLocationAvailable: true, inventory: { state: "INSUFFICIENT", projectedUnits: 0 } })).toBe(false);
    expect(isEffectivelyAvailable({ productActive: true, manualLocationAvailable: true, inventory: { state: "SUFFICIENT", projectedUnits: 2 } })).toBe(true);
    expect(isEffectivelyAvailable({ productActive: true, manualLocationAvailable: false, inventory: { state: "SUFFICIENT", projectedUnits: 2 } })).toBe(false);
    expect(isEffectivelyAvailable({ productActive: true, manualLocationAvailable: true, inventory: { state: "NOT_TRACKED", projectedUnits: null } })).toBe(true);
  });
});
