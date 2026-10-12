import "server-only";

import { getMenuForLocationRecord } from "@/server/repositories/menu.repository";
import { getEffectiveProductAvailabilities } from "@/server/services/stock-availability.service";
import { validateCustomerSession } from "@/server/services/customer-session.service";
import type { CustomerMenuContext, CustomerMenuProduct } from "@/types/customer-menu";

export async function getCustomerMenu(rawSessionToken: string | undefined, now = new Date()): Promise<CustomerMenuContext> {
  const session = await validateCustomerSession(rawSessionToken, now);
  const organizationId = session.seat.hall.location.organizationId;
  const locationId = session.seat.hall.location.id;
  const menu = await getMenuForLocationRecord(organizationId, locationId, true);
  const available = await getEffectiveProductAvailabilities(organizationId, menu.categories.flatMap(category => category.products.map(product => product.id)), locationId);
  const categories = menu.categories.map((category) => ({
    slug: category.slug,
    name: category.name,
    products: category.products.map((product): CustomerMenuProduct => {
      const availability = available.get(product.id);
      return {
        slug: product.slug,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        price: product.price,
        currencyCode: product.currencyCode,
        availability: !availability || !availability.effectiveAvailable
          ? "OUT_OF_STOCK"
          : availability.inventory.state === "NOT_TRACKED"
            ? "NOT_TRACKED"
            : "AVAILABLE",
      };
    }),
  }));
  return {
    movieTitle: session.screening.movie.title,
    locationName: session.seat.hall.location.name,
    hallName: session.seat.hall.name,
    seatLabel: session.seat.label,
    screeningEndsAt: session.screening.endsAt.toISOString(),
    categories,
  };
}
