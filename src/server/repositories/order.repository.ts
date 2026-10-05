import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { aggregateRecipeRequirements, lineTotal, orderSubtotal } from "@/lib/orders/calculations";
import { isPrismaError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { ServiceError } from "@/server/services/service-error";
import type { CustomerOrder, OrderStatus } from "@/types/order";

export const orderInclude = {
  items: { orderBy: { createdAt: "asc" as const } },
  location: { select: { timezone: true } },
  statusEvents: { orderBy: { createdAt: "asc" as const } },
} as const;

function publicOrderCode() {
  return `CB-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export function orderDto(row: {
  publicOrderCode: string; status: OrderStatus; currencyCode: string;
  subtotal: { toFixed(value: number): string }; total: { toFixed(value: number): string };
  customerNote: string | null; locationNameSnapshot: string; hallNameSnapshot: string;
  seatLabelSnapshot: string; movieTitleSnapshot: string; screeningStartsAt: Date; createdAt: Date;
  items: Array<{ productNameSnapshot: string; productImageSnapshot: string | null; quantity: number;
    unitPrice: { toFixed(value: number): string }; lineTotal: { toFixed(value: number): string }; currencyCode: string }>;
  location?: { timezone: string };
  statusEvents?: Array<{ fromStatus: OrderStatus | null; toStatus: OrderStatus; actorType: "CUSTOMER" | "STAFF" | "SYSTEM"; createdAt: Date }>;
}): CustomerOrder {
  return {
    publicOrderCode: row.publicOrderCode, status: row.status, currencyCode: row.currencyCode,
    subtotal: row.subtotal.toFixed(2), total: row.total.toFixed(2), customerNote: row.customerNote,
    locationName: row.locationNameSnapshot, hallName: row.hallNameSnapshot, seatLabel: row.seatLabelSnapshot,
    movieTitle: row.movieTitleSnapshot, screeningStartsAt: row.screeningStartsAt.toISOString(), createdAt: row.createdAt.toISOString(),
    timezone: row.location?.timezone ?? "UTC",
    history: (row.statusEvents ?? []).map((event) => ({ fromStatus: event.fromStatus, toStatus: event.toStatus, actorType: event.actorType, createdAt: event.createdAt.toISOString() })),
    items: row.items.map((item) => ({
      productName: item.productNameSnapshot, imageUrl: item.productImageSnapshot, quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2), lineTotal: item.lineTotal.toFixed(2), currencyCode: item.currencyCode,
    })),
  };
}

export async function placeOrderRecord(input: { customerSessionId: string; idempotencyKey: string; customerNote: string | null; now: Date }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const replay = await tx.order.findUnique({
          where: { customerSessionId_idempotencyKey: { customerSessionId: input.customerSessionId, idempotencyKey: input.idempotencyKey } },
          include: orderInclude,
        });
        if (replay) return { kind: "order" as const, order: orderDto(replay), replayed: true };

        const session = await tx.customerSession.findUnique({
          where: { id: input.customerSessionId },
          include: {
            seat: { include: { hall: { include: { location: { include: { organization: true } } } } } },
            screening: { include: { movie: true } },
            cart: {
              include: {
                items: {
                  include: {
                    product: {
                      include: {
                        productLocations: true,
                        category: true,
                        recipeComponents: { include: { inventoryItem: { include: { locationInventories: true } } } },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!session || session.status !== "ACTIVE" || input.now >= session.expiresAt) throw new ServiceError("CUSTOMER_SESSION_EXPIRED", 401, "This seat session has ended.");
        const location = session.seat.hall.location;
        const operational = session.seat.status === "ACTIVE" && session.seat.hall.status === "ACTIVE"
          && location.status === "ACTIVE" && location.organization.status === "ACTIVE";
        const live = session.screening.status === "SCHEDULED" && session.screening.hallId === session.hallId
          && input.now >= session.screening.startsAt && input.now < session.screening.endsAt;
        if (!operational || !live) throw new ServiceError("CUSTOMER_SESSION_EXPIRED", 401, "This screening is no longer accepting orders.");
        const cartItems = session.cart?.items ?? [];
        if (!cartItems.length) throw new ServiceError("CART_EMPTY", 409, "Your cart is empty.");

        const changed: Array<{ id: string; price: Prisma.Decimal; currency: string; name: string }> = [];
        const checkoutLines = cartItems.map((item) => {
          const offer = item.product.productLocations.find((entry) => entry.locationId === location.id);
          if (!offer || !offer.isAvailable || item.product.status !== "ACTIVE" || item.product.category.status !== "ACTIVE") throw new ServiceError("PRODUCT_UNAVAILABLE", 409, `${item.product.name} is no longer available.`);
          if (!offer.price.equals(item.reviewedUnitPrice) || offer.currencyCode !== item.reviewedCurrencyCode) {
            changed.push({ id: item.id, price: offer.price, currency: offer.currencyCode, name: item.product.name });
          }
          for (const component of item.product.recipeComponents) {
            const inventory = component.inventoryItem.locationInventories.find((entry) => entry.locationId === location.id);
            if (component.inventoryItem.status !== "ACTIVE" || !inventory) throw new ServiceError("PRODUCT_UNAVAILABLE", 409, `${item.product.name} is currently out of stock.`);
          }
          return { item, offer };
        });
        if (changed.length) {
          await Promise.all(changed.map((entry) => tx.cartItem.update({ where: { id: entry.id }, data: { reviewedUnitPrice: entry.price, reviewedCurrencyCode: entry.currency } })));
          return { kind: "price-changed" as const, products: changed.map((entry) => entry.name) };
        }
        const currencies = new Set(checkoutLines.map(({ offer }) => offer.currencyCode));
        if (currencies.size !== 1) throw new ServiceError("MIXED_CURRENCY", 409, "All cart items must use the same currency.");

        const requirements = aggregateRecipeRequirements(checkoutLines.map(({ item }) => ({
          quantity: item.quantity,
          recipe: item.product.recipeComponents.map((component) => ({ inventoryItemId: component.inventoryItemId, quantityRequired: component.quantityRequired.toFixed(3) })),
        })));
        const currencyCode = checkoutLines[0]!.offer.currencyCode;
        const total = orderSubtotal(checkoutLines.map(({ item, offer }) => ({ unitPrice: offer.price.toFixed(2), quantity: item.quantity })));
        const orderId = randomUUID();
        const order = await tx.order.create({
          data: {
            id: orderId, publicOrderCode: publicOrderCode(), customerSessionId: session.id,
            organizationId: location.organizationId, locationId: location.id, hallId: session.hallId,
            seatId: session.seatId, screeningId: session.screeningId, currencyCode, subtotal: total, total,
            customerNote: input.customerNote, idempotencyKey: input.idempotencyKey,
            locationNameSnapshot: location.name, hallNameSnapshot: session.seat.hall.name,
            seatLabelSnapshot: session.seat.label, movieTitleSnapshot: session.screening.movie.title,
            screeningStartsAt: session.screening.startsAt,
            statusEvents: { create: { id: randomUUID(), toStatus: "PLACED", actorType: "CUSTOMER" } },
            items: { create: checkoutLines.map(({ item, offer }) => ({
              id: randomUUID(), productId: item.productId, productNameSnapshot: item.product.name,
              productImageSnapshot: item.product.imageUrl, unitPrice: offer.price, currencyCode,
              quantity: item.quantity, lineTotal: lineTotal(offer.price.toFixed(2), item.quantity),
            })) },
          },
          include: orderInclude,
        });

        for (const [inventoryItemId, requiredText] of requirements) {
          const required = new Prisma.Decimal(requiredText);
          const inventory = await tx.locationInventory.findUnique({ where: { locationId_inventoryItemId: { locationId: location.id, inventoryItemId } } });
          if (!inventory) throw new ServiceError("INSUFFICIENT_STOCK", 409, "An item in your cart just went out of stock.");
          const update = await tx.locationInventory.updateMany({
            where: { id: inventory.id, quantityOnHand: { gte: required } }, data: { quantityOnHand: { decrement: required } },
          });
          if (update.count !== 1) throw new ServiceError("INSUFFICIENT_STOCK", 409, "An item in your cart just went out of stock.");
          await tx.inventoryMovement.create({ data: {
            id: randomUUID(), organizationId: location.organizationId, locationInventoryId: inventory.id,
            type: "ORDER_CONSUMPTION", quantityDelta: required.negated(), reason: "Customer order", orderId,
          } });
        }
        await tx.auditLog.create({ data: {
          action: "ORDER_PLACED", entityType: "ORDER", entityId: orderId,
          organizationId: location.organizationId, locationId: location.id, hallId: session.hallId,
          metadata: { publicOrderCode: order.publicOrderCode, itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0), total, currencyCode },
        } });
        await tx.cartItem.deleteMany({ where: { cartId: session.cart!.id } });
        return { kind: "order" as const, order: orderDto(order), replayed: false };
      }, { isolationLevel: "Serializable" });
      if (result.kind === "price-changed") throw new ServiceError("PRICE_CHANGED", 409, `Prices changed for: ${result.products.join(", ")}. Review your cart and place the order again.`);
      return result;
    } catch (error) {
      if (attempt < 2 && (isPrismaError(error, "P2034") || isPrismaError(error, "P2002"))) continue;
      throw error;
    }
  }
  throw new ServiceError("CHECKOUT_CONFLICT", 409, "Checkout is busy. Please try again.");
}

export async function getCustomerOrderRecord(customerSessionId: string, publicCode: string) {
  const row = await prisma.order.findFirst({ where: { customerSessionId, publicOrderCode: publicCode }, include: orderInclude });
  return row ? orderDto(row) : null;
}

export async function listAdminOrdersRecord(organizationId: string, permittedLocationIds: readonly string[] | null) {
  const rows = await prisma.order.findMany({
    where: { organizationId, ...(permittedLocationIds === null ? {} : { locationId: { in: [...permittedLocationIds] } }) },
    include: orderInclude,
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return rows.map((row) => ({ id: row.id, ...orderDto(row) }));
}

export async function getAdminOrderRecord(organizationId: string, orderId: string, permittedLocationIds: readonly string[] | null) {
  const row = await prisma.order.findFirst({
    where: { id: orderId, organizationId, ...(permittedLocationIds === null ? {} : { locationId: { in: [...permittedLocationIds] } }) },
    include: orderInclude,
  });
  return row ? { id: row.id, ...orderDto(row) } : null;
}
