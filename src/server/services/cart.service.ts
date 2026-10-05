import "server-only";

import { lineTotal, orderSubtotal } from "@/lib/orders/calculations";
import { getCartRecord, getCustomerProductOfferRecord, setCartItemRecord } from "@/server/repositories/cart.repository";
import { validateCustomerSession } from "@/server/services/customer-session.service";
import { ServiceError } from "@/server/services/service-error";
import { getEffectiveProductAvailability } from "@/server/services/stock-availability.service";
import type { CustomerCart } from "@/types/order";
import { cartItemUpdateSchema } from "@/validation/order";

type CartRecord = NonNullable<Awaited<ReturnType<typeof getCartRecord>>>;

async function cartDto(record: CartRecord | null, organizationId: string, locationId: string): Promise<CustomerCart> {
  if (!record) return { items: [], itemCount: 0, subtotal: "0.00", currencyCode: null };
  const items = await Promise.all(record.items.map(async (item) => {
    const offer = item.product.productLocations?.find?.((entry: { locationId: string }) => entry.locationId === locationId);
    const availability = await getEffectiveProductAvailability(organizationId, item.productId, locationId).catch(() => null);
    const unitPrice = offer?.price?.toFixed(2) ?? item.reviewedUnitPrice.toFixed(2);
    return {
      productSlug: item.product.slug,
      productName: item.product.name,
      imageUrl: item.product.imageUrl,
      quantity: item.quantity,
      unitPrice,
      currencyCode: offer?.currencyCode ?? item.reviewedCurrencyCode,
      lineTotal: lineTotal(unitPrice, item.quantity),
      availability: availability?.effectiveAvailable ? "AVAILABLE" as const : "OUT_OF_STOCK" as const,
    };
  }));
  const currencies = new Set(items.map((item) => item.currencyCode));
  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: currencies.size <= 1 ? orderSubtotal(items) : "0.00",
    currencyCode: currencies.size === 1 ? items[0]?.currencyCode ?? null : null,
  };
}

export async function getCustomerCart(rawToken: string | undefined, now = new Date()) {
  const session = await validateCustomerSession(rawToken, now);
  const organizationId = session.seat.hall.location.organizationId;
  const locationId = session.seat.hall.location.id;
  const record = await getCartRecord(session.id);
  return cartDto(record, organizationId, locationId);
}

export async function setCustomerCartItem(rawToken: string | undefined, input: unknown, now = new Date()) {
  const parsed = cartItemUpdateSchema.parse(input);
  const session = await validateCustomerSession(rawToken, now);
  const organizationId = session.seat.hall.location.organizationId;
  const locationId = session.seat.hall.location.id;
  const product = await getCustomerProductOfferRecord({ organizationId, locationId, productSlug: parsed.productSlug });
  const offer = product?.productLocations[0];
  if (!product || product.status !== "ACTIVE" || product.category.status !== "ACTIVE" || !offer) throw new ServiceError("PRODUCT_UNAVAILABLE", 404, "This product is not available at your cinema.");
  if (parsed.quantity > 0) {
    const availability = await getEffectiveProductAvailability(organizationId, product.id, locationId);
    if (!offer.isAvailable || !availability.effectiveAvailable) throw new ServiceError("PRODUCT_UNAVAILABLE", 409, "This product is currently out of stock.");
  }
  await setCartItemRecord({
    customerSessionId: session.id,
    productId: product.id,
    quantity: parsed.quantity,
    unitPrice: offer.price.toFixed(2),
    currencyCode: offer.currencyCode,
  });
  return getCustomerCart(rawToken, now);
}
