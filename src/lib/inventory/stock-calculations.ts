import type { StockStatus } from "@/types/inventory";

export type InventoryAvailability =
  | { state: "NOT_TRACKED"; projectedUnits: null }
  | { state: "SUFFICIENT" | "INSUFFICIENT"; projectedUnits: number };

function thousandths(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0").slice(0, 3));
}

export function computeStockStatus(quantityOnHand: string, lowStockThreshold: string): StockStatus {
  const quantity = thousandths(quantityOnHand);
  if (quantity <= BigInt(0)) return "OUT_OF_STOCK";
  return quantity <= thousandths(lowStockThreshold) ? "LOW_STOCK" : "IN_STOCK";
}

export function projectedProductAvailability(
  components: ReadonlyArray<{ quantityOnHand: string; quantityRequired: string }>,
): InventoryAvailability {
  if (components.length === 0) return { state: "NOT_TRACKED", projectedUnits: null };
  let limiting: bigint | null = null;
  for (const component of components) {
    const required = thousandths(component.quantityRequired);
    if (required <= BigInt(0)) throw new Error("Recipe quantities must be greater than zero.");
    const producible = thousandths(component.quantityOnHand) / required;
    limiting = limiting === null || producible < limiting ? producible : limiting;
  }
  const projectedUnits = Number(limiting ?? BigInt(0));
  return { state: projectedUnits > 0 ? "SUFFICIENT" : "INSUFFICIENT", projectedUnits };
}

export function isEffectivelyAvailable(input: {
  productActive: boolean;
  manualLocationAvailable: boolean;
  inventory: InventoryAvailability;
}): boolean {
  return input.productActive && input.manualLocationAvailable && input.inventory.state !== "INSUFFICIENT";
}
