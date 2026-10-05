import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";

const cartInclude = {
  items: {
    include: { product: { include: { productLocations: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export async function getCartRecord(customerSessionId: string) {
  return prisma.cart.findUnique({ where: { customerSessionId }, include: cartInclude });
}

export async function setCartItemRecord(input: {
  customerSessionId: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  currencyCode: string;
}) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.upsert({
      where: { customerSessionId: input.customerSessionId },
      create: { id: randomUUID(), customerSessionId: input.customerSessionId },
      update: {},
    });
    if (input.quantity === 0) {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id, productId: input.productId } });
    } else {
      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId: input.productId } },
        create: {
          id: randomUUID(), cartId: cart.id, productId: input.productId, quantity: input.quantity,
          reviewedUnitPrice: input.unitPrice, reviewedCurrencyCode: input.currencyCode,
        },
        update: {
          quantity: input.quantity, reviewedUnitPrice: input.unitPrice, reviewedCurrencyCode: input.currencyCode,
        },
      });
    }
    return tx.cart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
  }, { isolationLevel: "Serializable" });
}

export async function getCustomerProductOfferRecord(input: {
  organizationId: string;
  locationId: string;
  productSlug: string;
}) {
  return prisma.product.findFirst({
    where: { organizationId: input.organizationId, slug: input.productSlug },
    include: { category: true, productLocations: { where: { locationId: input.locationId } } },
  });
}
