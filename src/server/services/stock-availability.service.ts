import "server-only";

import { isEffectivelyAvailable, projectedProductAvailability } from "@/lib/inventory/stock-calculations";
import { getStockAvailabilityInputsRecord } from "@/server/repositories/stock-availability.repository";

export async function getEffectiveProductAvailability(organizationId: string, productId: string, locationId: string) {
  const offer = await getStockAvailabilityInputsRecord(organizationId, productId, locationId);
  const inventory = projectedProductAvailability(offer.product.recipeComponents.map((component) => ({
    quantityRequired: component.quantityRequired.toFixed(3),
    quantityOnHand: component.inventoryItem.locationInventories[0]?.quantityOnHand.toFixed(3) ?? "0.000",
  })));
  return {
    manualLocationAvailable: offer.isAvailable,
    inventory,
    effectiveAvailable: isEffectivelyAvailable({
      productActive: offer.product.status === "ACTIVE",
      manualLocationAvailable: offer.isAvailable,
      inventory,
    }),
  };
}
