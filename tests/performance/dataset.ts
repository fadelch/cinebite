import { randomUUID } from "node:crypto";
import { evidenceRun, secrets } from "./environment";
import { baseFixture } from "./fixtures";
import { prisma } from "@/lib/db/prisma";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/security/opaque-token";
export async function bulk<T>(
  rows: T[],
  write: (batch: T[]) => Promise<unknown>,
) {
  for (let offset = 0; offset < rows.length; offset += 500)
    await write(rows.slice(offset, offset + 500));
}

/** Repeatable shape; unique run namespace retains earlier test history safely. */
export async function dataset() {
  const demo = await baseFixture();
  const a = demo.locations[0],
    b = demo.locations[2];
  const products = [];
  for (const [location, suffix, count] of [
    [a, "beirut", 499],
    [b, "other", 99],
  ] as const) {
    const rows = Array.from({ length: count }, (_, i) => ({
      id: randomUUID(),
      organizationId: location.organizationId,
      categoryId: `phase21-evidence-${evidenceRun}-category-${suffix}`,
      name: `Demo ${suffix} snack ${String(i + 1).padStart(3, "0")}`,
      slug: `demo-${suffix}-snack-${i + 1}`,
      sortOrder: i + 1,
      description: "Synthetic performance fixture, not customer data.",
    }));
    await prisma.product.createMany({ data: rows });
    await prisma.productLocation.createMany({
      data: rows.map((p) => ({
        productId: p.id,
        locationId: location.id,
        organizationId: location.organizationId,
        price: "12.50",
        currencyCode: "USD",
      })),
    });
    if (suffix === "beirut")
      await prisma.productRecipeComponent.createMany({
        data: rows.map((p) => ({
          organizationId: p.organizationId,
          productId: p.id,
          inventoryItemId: `phase21-evidence-${evidenceRun}-kernels`,
          quantityRequired: "10.000",
        })),
      });
    products.push(...rows);
  }
  for (const location of demo.locations) {
    const suffix = location.id.endsWith("beirut")
      ? "beirut"
      : location.id.endsWith("dbayeh")
        ? "dbayeh"
        : "other";
    const existing = demo.sessions.filter((s) => s.suffix === suffix);
    const extras = Array.from({ length: 100 - existing.length }, (_, i) => ({
      hallId: `phase21-evidence-${evidenceRun}-hall-${suffix}`,
      id: `a${i + (suffix === "beirut" ? 11 : 8)}`,
      row: "A",
      number: i + (suffix === "beirut" ? 11 : 8),
      label: `A${i + (suffix === "beirut" ? 11 : 8)}`,
    }));
    await prisma.seat.createMany({ data: extras });
    const customerRows = extras.map((seat) => {
      const token = createOpaqueToken();
      secrets.add(token);
      return {
        token,
        id: randomUUID(),
        suffix,
        number: seat.number,
        screeningId: existing[0].screeningId,
        productId: existing[0].productId,
        seatId: seat.id,
        hallId: seat.hallId,
      };
    });
    await prisma.customerSession.createMany({
      data: customerRows.map((s) => ({
        id: s.id,
        hallId: s.hallId,
        seatId: s.seatId,
        screeningId: s.screeningId,
        tokenHash: hashOpaqueToken(s.token),
        expiresAt: new Date(Date.now() + 10800000),
        lastSeenAt: new Date(),
      })),
    });
    const carts = customerRows.map((s) => ({
      id: randomUUID(),
      customerSessionId: s.id,
    }));
    await prisma.cart.createMany({ data: carts });
    await prisma.cartItem.createMany({
      data: carts.map((c) => ({
        cartId: c.id,
        productId: existing[0].productId,
        quantity: 1,
        reviewedUnitPrice: "12.50",
        reviewedCurrencyCode: "USD",
      })),
    });
    demo.sessions.push(...customerRows);
  }
  for (const s of demo.sessions) secrets.add(s.token);
  const historyStaff: string[] = [];
  for (const organizationId of [demo.org.id, demo.other.id]) {
    const worker = await prisma.user.create({
      data: {
        firebaseUid: `unissued-history-${organizationId}`,
        email: `history.${randomUUID()}@example.test`,
        displayName: "Demo Historical Delivery",
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: worker.id,
        organizationId,
        role: "DELIVERY_STAFF",
        allLocations: true,
      },
    });
    historyStaff.push(worker.id);
  }
  const orders = Array.from({ length: 6000 }, (_, i) => {
    const location = demo.locations[i % 3],
      suffix = location.id.endsWith("beirut")
        ? "beirut"
        : location.id.endsWith("dbayeh")
          ? "dbayeh"
          : "other";
    const session = demo.sessions.filter((s) => s.suffix === suffix)[
      Math.floor(i / 3) % 100
    ];
    const createdAt = new Date(Date.now() - (i % 360) * 86400000 - i * 1000);
    const status = (
      ["PLACED", "ACCEPTED", "PREPARING", "READY", "DELIVERED"] as const
    )[i % 5];
    return {
      id: randomUUID(),
      publicOrderCode: `CB-${(i + 100000).toString(16).padStart(10, "0").toUpperCase()}`,
      customerSessionId: session.id,
      organizationId: location.organizationId,
      locationId: location.id,
      hallId: `phase21-evidence-${evidenceRun}-hall-${suffix}`,
      seatId: `a${session.number}`,
      screeningId: session.screeningId,
      status,
      paymentPolicy: "ONLINE_REQUIRED" as const,
      fulfillmentEligible: true,
      currencyCode: "USD",
      subtotal: "12.50",
      total: "12.50",
      idempotencyKey: randomUUID(),
      locationNameSnapshot: location.name,
      hallNameSnapshot: "Hall 1",
      seatLabelSnapshot: `A${session.number}`,
      movieTitleSnapshot: "Interstellar",
      screeningStartsAt: createdAt,
      createdAt,
      readyAt: status === "READY" ? createdAt : null,
      deliveredAt: status === "DELIVERED" ? createdAt : null,
    };
  });
  await bulk(
    orders.map((o) => ({
      ...o,
      status: "PLACED" as const,
      fulfillmentEligible: false,
      readyAt: null,
      deliveredAt: null,
    })),
    (data) => prisma.order.createMany({ data }),
  );
  await bulk(
    orders.map((o) => ({
      orderId: o.id,
      productId: demo.sessions.find((s) => s.id === o.customerSessionId)!
        .productId,
      productNameSnapshot: "Large Popcorn",
      unitPrice: "12.50",
      currencyCode: "USD",
      quantity: 1,
      lineTotal: "12.50",
      createdAt: o.createdAt,
    })),
    (data) => prisma.orderItem.createMany({ data }),
  );
  const payments = orders.map((o) => ({
    id: randomUUID(),
    orderId: o.id,
    provider: "sandbox",
    providerPaymentId: `sandbox_fixture_${o.id}`,
    status: "SUCCEEDED" as const,
    amount: "12.50",
    currencyCode: "USD",
    succeededAt: o.createdAt,
    createdAt: o.createdAt,
  }));
  await bulk(payments, (data) => prisma.payment.createMany({ data }));
  await bulk(
    payments.map((p) => ({
      paymentId: p.id,
      number: 1,
      idempotencyKey: randomUUID(),
      providerPaymentId: p.providerPaymentId,
      status: "SUCCEEDED" as const,
      expiresAt: new Date(p.createdAt.getTime() + 600000),
      succeededAt: p.createdAt,
      createdAt: p.createdAt,
    })),
    (data) => prisma.paymentAttempt.createMany({ data }),
  );
  // Respect database payment/transition guards even for synthetic historical data.
  await bulk(orders, (data) =>
    prisma.order.updateMany({
      where: { id: { in: data.map((o) => o.id) } },
      data: { fulfillmentEligible: true },
    }),
  );
  for (const status of [
    "ACCEPTED",
    "PREPARING",
    "READY",
    "DELIVERED",
  ] as const) {
    for (const organizationId of [demo.org.id, demo.other.id]) {
      const rows = orders.filter(
        (o) => o.status === status && o.organizationId === organizationId,
      );
      await bulk(rows, (data) =>
        prisma.order.updateMany({
          where: { id: { in: data.map((o) => o.id) } },
          data: {
            status,
            ...(status === "READY" ? { readyAt: new Date() } : {}),
            ...(status === "DELIVERED"
              ? {
                  deliveryAssignedUserId:
                    historyStaff[organizationId === demo.org.id ? 0 : 1],
                  deliveryClaimedAt: new Date(),
                  deliveredAt: new Date(),
                }
              : {}),
          },
        }),
      );
    }
  }
  const history = orders.flatMap((o) => {
    const states = [
      "PLACED",
      "ACCEPTED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ] as const;
    return states
      .slice(0, states.indexOf(o.status) + 1)
      .map((toStatus, index) => ({
        orderId: o.id,
        fromStatus: index ? states[index - 1] : null,
        toStatus,
        actorType: index ? ("STAFF" as const) : ("CUSTOMER" as const),
        actorUserId: index
          ? historyStaff[o.organizationId === demo.org.id ? 0 : 1]
          : null,
        createdAt: new Date(o.createdAt.getTime() + index * 1000),
      }));
  });
  await bulk(history, (data) => prisma.orderStatusEvent.createMany({ data }));
  await bulk(orders, (data) =>
    prisma.notificationOutbox.updateMany({
      where: { entityId: { in: data.map((o) => o.id) } },
      data: { status: "PROCESSED", processedAt: new Date() },
    }),
  );
  const staff = Array.from({ length: 150 }, (_, i) => ({
    id: randomUUID(),
    firebaseUid: `unissued-demo-${evidenceRun}-${i}`,
    email: `demo.${evidenceRun}.${i}@example.test`,
    displayName: `Demo Team ${i}`,
    active: true,
  }));
  await prisma.user.createMany({ data: staff });
  const members = staff.map((u) => ({
    id: randomUUID(),
    userId: u.id,
    organizationId: demo.org.id,
    role: "DELIVERY_STAFF" as const,
    allLocations: false,
  }));
  await prisma.organizationMembership.createMany({ data: members });
  await prisma.locationAccess.createMany({
    data: members.map((m) => ({
      membershipId: m.id,
      organizationId: m.organizationId,
      locationId: demo.locations[1].id,
    })),
  });
  // Independent constrained item for exact last-stock and shared-ingredient contention.
  const scarce = await prisma.inventoryItem.create({
    data: {
      organizationId: demo.org.id,
      name: "Demo limited portions",
      sku: `LIMITED-${evidenceRun}`,
      unit: "EACH",
    },
  });
  const scarceStock = await prisma.locationInventory.create({
    data: {
      organizationId: demo.org.id,
      locationId: a.id,
      inventoryItemId: scarce.id,
      quantityOnHand: "10.000",
    },
  });
  const scarceProducts = [];
  for (const [name, quantity] of [
    ["Demo Pepsi", "1.000"],
    ["Demo Double Pepsi", "2.000"],
  ] as const) {
    const p = await prisma.product.create({
      data: {
        organizationId: demo.org.id,
        categoryId: `phase21-evidence-${evidenceRun}-category-beirut`,
        name,
        description: "Synthetic limited-stock fixture.",
        slug: name.toLowerCase().replaceAll(" ", "-"),
      },
    });
    await prisma.productLocation.create({
      data: {
        organizationId: demo.org.id,
        locationId: a.id,
        productId: p.id,
        price: "12.50",
        currencyCode: "USD",
      },
    });
    await prisma.productRecipeComponent.create({
      data: {
        organizationId: demo.org.id,
        productId: p.id,
        inventoryItemId: scarce.id,
        quantityRequired: quantity,
      },
    });
    scarceProducts.push(p);
  }
  return { ...demo, products, orders, scarceStock, scarceProducts };
}
