import "server-only";

import { getMenuForLocationRecord } from "@/server/repositories/menu.repository";
import { getEffectiveProductAvailability } from "@/server/services/stock-availability.service";
import { validateCustomerSession } from "@/server/services/customer-session.service";
import type { CustomerMenuContext, CustomerMenuProduct } from "@/types/customer-menu";

export async function getCustomerMenu(rawSessionToken: string | undefined, now = new Date()): Promise<CustomerMenuContext> {
  const session = await validateCustomerSession(rawSessionToken, now);
  const organizationId = session.seat.hall.location.organizationId;
  const locationId = session.seat.hall.location.id;
  const menu = await getMenuForLocationRecord(organizationId, locationId, true);
  const categories = await Promise.all(menu.categories.map(async (category) => ({
    slug: category.slug,
    name: category.name,
    products: await Promise.all(category.products.map(async (product): Promise<CustomerMenuProduct> => {
      const availability = await getEffectiveProductAvailability(organizationId, product.id, locationId);
      return {
        slug: product.slug,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        price: product.price,
        currencyCode: product.currencyCode,
        availability: availability.inventory.state === "INSUFFICIENT"
          ? "OUT_OF_STOCK"
          : availability.inventory.state === "NOT_TRACKED"
            ? "NOT_TRACKED"
            : "AVAILABLE",
      };
    })),
  })));
  return {
    movieTitle: session.screening.movie.title,
    locationName: session.seat.hall.location.name,
    hallName: session.seat.hall.name,
    seatLabel: session.seat.label,
    screeningEndsAt: session.screening.endsAt.toISOString(),
    categories,
  };
}
