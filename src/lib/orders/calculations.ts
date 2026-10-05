export const MAX_CART_QUANTITY = 20;

function parseCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Invalid money value.");
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Money value is too large.");
  return cents;
}

function formatCents(value: number): string {
  return `${Math.floor(value / 100)}.${(value % 100).toString().padStart(2, "0")}`;
}

export function lineTotal(unitPrice: string, quantity: number): string {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) throw new Error("Invalid quantity.");
  return formatCents(parseCents(unitPrice) * quantity);
}

export function orderSubtotal(lines: ReadonlyArray<{ unitPrice: string; quantity: number }>): string {
  return formatCents(lines.reduce((sum, line) => sum + parseCents(line.unitPrice) * line.quantity, 0));
}

export interface RecipeRequirement {
  inventoryItemId: string;
  quantityRequired: string;
}

export function aggregateRecipeRequirements(lines: ReadonlyArray<{
  quantity: number;
  recipe: readonly RecipeRequirement[];
}>): Map<string, string> {
  const thousandths = new Map<string, number>();
  for (const line of lines) {
    for (const component of line.recipe) {
      if (!/^\d+(?:\.\d{1,3})?$/.test(component.quantityRequired)) throw new Error("Invalid recipe quantity.");
      const [whole, fraction = ""] = component.quantityRequired.split(".");
      const parsed = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
      const value = parsed * line.quantity;
      if (!Number.isSafeInteger(value)) throw new Error("Recipe quantity is too large.");
      thousandths.set(component.inventoryItemId, (thousandths.get(component.inventoryItemId) ?? 0) + value);
    }
  }
  return new Map([...thousandths].map(([key, value]) => [key, `${Math.floor(value / 1000)}.${(value % 1000).toString().padStart(3, "0")}`]));
}
