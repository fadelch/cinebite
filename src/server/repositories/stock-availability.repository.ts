import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ServiceError } from "@/server/services/service-error";

export async function getStockAvailabilityInputsRecord(organizationId: string, productId: string, locationId: string) {
  const offer = await prisma.productLocation.findFirst({
    where: { organizationId, productId, locationId },
    include: {
      product: {
        select: {
          status: true,
          recipeComponents: {
            select: {
              quantityRequired: true,
              inventoryItemId: true,
              inventoryItem: {
                select: {
                  locationInventories: {
                    where: { locationId },
                    select: { quantityOnHand: true, quantityReserved: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!offer) throw new ServiceError("PRODUCT_LOCATION_CONFLICT", 404, "Product is not assigned to this location.");
  return offer;
}

/** One scoped batch, irrespective of the number of products; no cached stock. */
export async function getStockAvailabilityBatchRecord(organizationId: string, productIds: readonly string[], locationId: string) {
  if (!productIds.length) return [];
  return prisma.productLocation.findMany({
    where: { organizationId, locationId, productId: { in: [...new Set(productIds)] }, product: { organizationId } },
    select: { productId: true, isAvailable: true, product: { select: { status: true, recipeComponents: {
      where: { organizationId }, select: { quantityRequired: true, inventoryItem: { select: {
        locationInventories: { where: { organizationId, locationId }, select: { quantityOnHand: true, quantityReserved: true } },
      } } },
    } } } },
  });
}
