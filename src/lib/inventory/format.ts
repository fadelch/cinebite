import type { InventoryMovementType, InventoryUnit, StockStatus } from "@/types/inventory";

export function formatInventoryQuantity(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export const inventoryUnitLabel: Record<InventoryUnit, string> = {
  EACH: "each",
  GRAM: "g",
  MILLILITER: "ml",
};

export const stockStatusLabel: Record<StockStatus, string> = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
};

export const movementTypeLabel: Record<InventoryMovementType, string> = {
  RECEIVE: "Received",
  ADJUSTMENT_IN: "Adjustment in",
  ADJUSTMENT_OUT: "Adjustment out",
  WASTE: "Waste",
};
