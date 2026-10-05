import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const transaction = {
    order: { findUnique: vi.fn(), create: vi.fn() },
    customerSession: { findUnique: vi.fn() },
    cartItem: { update: vi.fn(), deleteMany: vi.fn() },
    locationInventory: { findUnique: vi.fn(), updateMany: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { prisma: { $transaction: vi.fn(), order: { findFirst: vi.fn() } }, transaction };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database.prisma }));

import { Prisma } from "@/generated/prisma/client";
import { getCustomerOrderRecord, placeOrderRecord } from "@/server/repositories/order.repository";

const now = new Date("2026-10-05T12:00:00.000Z");
const decimal = (value: string) => new Prisma.Decimal(value);

function orderRow() {
  return {
    publicOrderCode: "CB-12AB34CD56", status: "PLACED" as const, currencyCode: "USD",
    subtotal: decimal("5.00"), total: decimal("5.00"), customerNote: null,
    locationNameSnapshot: "Demo Beirut", hallNameSnapshot: "Hall 1", seatLabelSnapshot: "A7",
    movieTitleSnapshot: "Interstellar", screeningStartsAt: now, createdAt: now,
    items: [{ productNameSnapshot: "Large Popcorn", productImageSnapshot: null, quantity: 1, unitPrice: decimal("5.00"), lineTotal: decimal("5.00"), currencyCode: "USD" }],
  };
}

function liveSession(items: Array<{ price: string; reviewed?: string; currency?: string; reviewedCurrency?: string; active?: boolean; available?: boolean }>) {
  return {
    id: "session-a7", status: "ACTIVE", expiresAt: new Date("2026-10-05T14:00:00.000Z"), hallId: "hall-1", seatId: "seat-a7", screeningId: "screening-live",
    seat: { id: "seat-a7", label: "A7", status: "ACTIVE", hall: { id: "hall-1", name: "Hall 1", status: "ACTIVE", location: { id: "loc-beirut", name: "Demo Beirut", status: "ACTIVE", organizationId: "org-demo", organization: { status: "ACTIVE" } } } },
    screening: { id: "screening-live", hallId: "hall-1", status: "SCHEDULED", startsAt: new Date("2026-10-05T11:00:00.000Z"), endsAt: new Date("2026-10-05T14:00:00.000Z"), movie: { title: "Interstellar" } },
    cart: { id: "cart-a7", items: items.map((value, index) => ({
      id: `cart-item-${index}`, productId: `product-${index}`, quantity: 1,
      reviewedUnitPrice: decimal(value.reviewed ?? value.price), reviewedCurrencyCode: value.reviewedCurrency ?? value.currency ?? "USD",
      product: {
        name: index ? "Pepsi" : "Large Popcorn", imageUrl: null, status: value.active === false ? "INACTIVE" : "ACTIVE",
        category: { status: "ACTIVE" }, recipeComponents: [],
        productLocations: [{ locationId: "loc-beirut", price: decimal(value.price), currencyCode: value.currency ?? "USD", isAvailable: value.available !== false }],
      },
    })) },
  };
}

describe("secure order transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.prisma.$transaction.mockImplementation(async (operation: (client: typeof database.transaction) => unknown) => operation(database.transaction));
    database.transaction.order.findUnique.mockResolvedValue(null);
  });

  it("requires both owning customer session and public code on status reads", async () => {
    database.prisma.order.findFirst.mockResolvedValue(null);
    expect(await getCustomerOrderRecord("owning-session", "CB-12AB34CD56")).toBeNull();
    expect(database.prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { customerSessionId: "owning-session", publicOrderCode: "CB-12AB34CD56" } }));
  });

  it("replays an existing same-key order before touching cart or stock", async () => {
    database.transaction.order.findUnique.mockResolvedValue(orderRow());
    const result = await placeOrderRecord({ customerSessionId: "session-a7", idempotencyKey: "same-key-123456789", customerNote: null, now });
    expect(result).toMatchObject({ replayed: true, order: { publicOrderCode: "CB-12AB34CD56", total: "5.00" } });
    expect(database.transaction.customerSession.findUnique).not.toHaveBeenCalled();
    expect(database.transaction.locationInventory.updateMany).not.toHaveBeenCalled();
    expect(database.transaction.order.create).not.toHaveBeenCalled();
  });

  it("creates the initial CUSTOMER PLACED event inside checkout, without a client timestamp", async () => {
    database.transaction.customerSession.findUnique.mockResolvedValue(liveSession([{ price: "5.00" }]));
    database.transaction.order.create.mockResolvedValue(orderRow());
    await placeOrderRecord({ customerSessionId: "session-a7", idempotencyKey: "initial-event-123456", customerNote: null, now });
    const event = database.transaction.order.create.mock.calls[0][0].data.statusEvents.create;
    expect(event).toEqual({ id: expect.any(String), toStatus: "PLACED", actorType: "CUSTOMER" });
    expect(database.transaction.cartItem.deleteMany).toHaveBeenCalledOnce();
    expect(database.transaction.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("commits new server review prices then requires another checkout", async () => {
    database.transaction.customerSession.findUnique.mockResolvedValue(liveSession([{ price: "5.50", reviewed: "5.00" }]));
    database.transaction.cartItem.update.mockResolvedValue({});
    await expect(placeOrderRecord({ customerSessionId: "session-a7", idempotencyKey: "price-key-1234567", customerNote: null, now })).rejects.toMatchObject({ code: "PRICE_CHANGED", status: 409 });
    expect(database.transaction.cartItem.update).toHaveBeenCalledWith({ where: { id: "cart-item-0" }, data: { reviewedUnitPrice: decimal("5.50"), reviewedCurrencyCode: "USD" } });
    expect(database.transaction.order.create).not.toHaveBeenCalled();
  });

  it("rejects mixed currency and unavailable products before creating an order", async () => {
    database.transaction.customerSession.findUnique.mockResolvedValue(liveSession([{ price: "5.00", currency: "USD" }, { price: "2.50", currency: "EUR" }]));
    await expect(placeOrderRecord({ customerSessionId: "session-a7", idempotencyKey: "mixed-key-1234567", customerNote: null, now })).rejects.toMatchObject({ code: "MIXED_CURRENCY" });
    database.transaction.customerSession.findUnique.mockResolvedValue(liveSession([{ price: "5.00", available: false }]));
    await expect(placeOrderRecord({ customerSessionId: "session-a7", idempotencyKey: "manual-key-123456", customerNote: null, now })).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
    expect(database.transaction.order.create).not.toHaveBeenCalled();
  });

  it("rejects expired and ended screening contexts", async () => {
    const expired = liveSession([{ price: "5.00" }]);
    expired.expiresAt = new Date("2026-10-05T11:59:59.000Z");
    database.transaction.customerSession.findUnique.mockResolvedValue(expired);
    await expect(placeOrderRecord({ customerSessionId: "session-a7", idempotencyKey: "expired-key-12345", customerNote: null, now })).rejects.toMatchObject({ code: "CUSTOMER_SESSION_EXPIRED" });
    const ended = liveSession([{ price: "5.00" }]);
    ended.screening.endsAt = now;
    database.transaction.customerSession.findUnique.mockResolvedValue(ended);
    await expect(placeOrderRecord({ customerSessionId: "session-a7", idempotencyKey: "ended-key-1234567", customerNote: null, now })).rejects.toMatchObject({ code: "CUSTOMER_SESSION_EXPIRED" });
  });
});
