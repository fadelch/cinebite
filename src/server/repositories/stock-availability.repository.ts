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
                    select: { quantityOnHand: true },
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
