import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/security/opaque-token";
export async function operationFixtures() {
  const prefix = `phase22-evidence-${randomUUID().slice(0, 8)}`;
  const organization = await prisma.organization.create({
    data: { slug: prefix, name: "CineBite Test Cinema" },
  });
  const other = await prisma.organization.create({
    data: { slug: prefix + "-other", name: "Isolated Cinema B" },
  });
  const location = await prisma.location.create({
    data: {
      organizationId: organization.id,
      name: "Demo Beirut",
      slug: prefix,
      addressLine1: "Synthetic cinema",
      city: "Beirut",
      country: "LB",
      timezone: "Asia/Beirut",
    },
  });
  const hall = await prisma.hall.create({
    data: { locationId: location.id, name: "Hall 1", number: 1 },
  });
  const seat = await prisma.seat.create({
    data: {
      id: randomUUID(),
      hallId: hall.id,
      row: "A",
      number: 1,
      label: "A1",
    },
  });
  const movie = await prisma.movie.create({
    data: {
      organizationId: organization.id,
      title: "Interstellar",
      slug: prefix,
      durationMinutes: 180,
    },
  });
  const screening = await prisma.screening.create({
    data: {
      hallId: hall.id,
      movieId: movie.id,
      startsAt: new Date(Date.now() - 300000),
      endsAt: new Date(Date.now() + 10800000),
    },
  });
  const category = await prisma.menuCategory.create({
    data: {
      organizationId: organization.id,
      name: "Cinema favorites",
      slug: prefix,
    },
  });
  const product = await prisma.product.create({
    data: {
      organizationId: organization.id,
      categoryId: category.id,
      name: "Large Popcorn",
      slug: prefix,
      description: "Synthetic cinema popcorn",
    },
  });
  await prisma.productLocation.create({
    data: {
      organizationId: organization.id,
      locationId: location.id,
      productId: product.id,
      price: "4.00",
      currencyCode: "USD",
    },
  });
  const inventory = await prisma.inventoryItem.create({
    data: {
      organizationId: organization.id,
      name: "Popcorn stock",
      sku: prefix,
      unit: "EACH",
    },
  });
  const stock = await prisma.locationInventory.create({
    data: {
      organizationId: organization.id,
      locationId: location.id,
      inventoryItemId: inventory.id,
      quantityOnHand: "100.000",
    },
  });
  const token = createOpaqueToken();
  const session = await prisma.customerSession.create({
    data: {
      hallId: hall.id,
      seatId: seat.id,
      screeningId: screening.id,
      tokenHash: hashOpaqueToken(token),
      expiresAt: screening.endsAt,
    },
  });
  const qr = createOpaqueToken();
  await prisma.seatQrCode.create({
    data: { hallId: hall.id, seatId: seat.id, tokenHash: hashOpaqueToken(qr) },
  });
  const order = await prisma.order.create({
    data: {
      publicOrderCode: `CB-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
      customerSessionId: session.id,
      organizationId: organization.id,
      locationId: location.id,
      hallId: hall.id,
      seatId: seat.id,
      screeningId: screening.id,
      currencyCode: "USD",
      subtotal: "4.00",
      total: "4.00",
      idempotencyKey: prefix,
      locationNameSnapshot: "Demo Beirut",
      hallNameSnapshot: "Hall 1",
      seatLabelSnapshot: "A1",
      movieTitleSnapshot: "Interstellar",
      screeningStartsAt: screening.startsAt,
      items: {
        create: {
          productId: product.id,
          productNameSnapshot: "Large Popcorn",
          quantity: 1,
          unitPrice: "4.00",
          lineTotal: "4.00",
          currencyCode: "USD",
        },
      },
    },
  });
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "sandbox",
      providerPaymentId: prefix,
      status: "SUCCEEDED",
      amount: "4.00",
      currencyCode: "USD",
      succeededAt: new Date(),
    },
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { fulfillmentEligible: true },
  });
  const refund = await prisma.refund.create({
    data: {
      paymentId: payment.id,
      orderId: order.id,
      provider: "sandbox",
      amount: "1.00",
      currencyCode: "USD",
      reasonCode: "CUSTOMER_REQUEST",
      initiatedByType: "SYSTEM",
      idempotencyKey: prefix,
      status: "SUCCEEDED",
      succeededAt: new Date(),
    },
  });
  return {
    prefix,
    organization,
    other,
    location,
    hall,
    seat,
    screening,
    product,
    inventory,
    stock,
    session,
    token,
    qr,
    order,
    payment,
    refund,
  };
}
