import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const tx = {
    user: { findUnique: vi.fn() }, order: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    orderStatusEvent: { create: vi.fn() }, auditLog: { create: vi.fn() },
  };
  return { prisma: { $transaction: vi.fn(), location: { findMany: vi.fn() }, order: { findFirst: vi.fn() } }, tx };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database.prisma }));

import { Prisma } from "@/generated/prisma/client";
import { buildOrderQueueWhere, getKitchenOrderRecord, getKitchenQueueRecord, kitchenOrderDto, transitionKitchenOrderRecord } from "@/server/repositories/kitchen.repository";
import type { KitchenActor } from "@/server/services/kitchen-access";

const actor: KitchenActor = { uid: "firebase-staff", email: "staff@example.com", displayName: "Kitchen", role: "KITCHEN_STAFF", organizationId: "org-a", locationIds: ["beirut"], allLocations: false, active: true };
const now = new Date("2026-10-05T12:00:00Z");
function row(status: "PLACED" | "ACCEPTED" | "PREPARING" | "READY") {
  return {
    id: "order-a", organizationId: "org-a", locationId: "beirut", hallId: "hall-a", publicOrderCode: "CB-12AB34CD56", status,
    currencyCode: "USD", subtotal: new Prisma.Decimal("5"), total: new Prisma.Decimal("5"), customerNote: "<script>alert(1)</script>",
    locationNameSnapshot: "Demo Beirut", hallNameSnapshot: "Original Hall", seatLabelSnapshot: "A7", movieTitleSnapshot: "Interstellar", screeningStartsAt: now, createdAt: now,
    location: { timezone: "Asia/Beirut" }, screening: { status: "CANCELLED", endsAt: now },
    statusEvents: [{ fromStatus: null, toStatus: "PLACED", actorType: "CUSTOMER", createdAt: now, actor: null }],
    items: [{ productNameSnapshot: "Original Popcorn", productImageSnapshot: null, quantity: 1, unitPrice: new Prisma.Decimal("5"), lineTotal: new Prisma.Decimal("5"), currencyCode: "USD" }],
  };
}

describe("atomic kitchen transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.prisma.$transaction.mockImplementation(async (operation: (tx: typeof database.tx) => unknown) => operation(database.tx));
    database.tx.user.findUnique.mockResolvedValue({ id: "staff-db", active: true, memberships: [{ role: "KITCHEN_STAFF", allLocations: false, locationAccess: [{ locationId: "beirut" }], organization: { status: "ACTIVE" } }] });
    database.tx.order.findFirst.mockResolvedValue(row("PLACED"));
    database.tx.order.updateMany.mockResolvedValue({ count: 1 });
    database.tx.order.findUniqueOrThrow.mockResolvedValue(row("ACCEPTED"));
    database.prisma.location.findMany.mockResolvedValue([{ id: "beirut", name: "Beirut", timezone: "Asia/Beirut" }]);
  });

  it.each([["PLACED", "ACCEPTED"], ["ACCEPTED", "PREPARING"], ["PREPARING", "READY"]] as const)("allows exactly one concurrent %s → %s", async (expectedStatus, toStatus) => {
    let current = expectedStatus as string;
    database.tx.order.updateMany.mockImplementation(async ({ where, data }: { where: { status: string }; data: { status: string } }) => {
      if (current !== where.status) return { count: 0 };
      current = data.status; return { count: 1 };
    });
    database.tx.order.findUniqueOrThrow.mockResolvedValue(row(toStatus));
    const results = await Promise.allSettled([1, 2].map(() => transitionKitchenOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus, toStatus })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(database.tx.orderStatusEvent.create).toHaveBeenCalledTimes(1);
    expect(database.tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(database.tx.orderStatusEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromStatus: expectedStatus, toStatus, actorType: "STAFF", actorUserId: "staff-db" }) });
    expect(database.tx.orderStatusEvent.create.mock.calls[0][0].data).not.toHaveProperty("createdAt");
    expect(database.tx.order.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ organizationId: "org-a", locationId: "beirut", status: expectedStatus }), data: { status: toStatus } });
    expect(Object.keys(database.tx)).not.toContain("locationInventory");
    expect(Object.keys(database.tx)).not.toContain("inventoryMovement");
    expect(Object.keys(database.tx)).not.toContain("orderItem");
  });

  it("fails closed for skips, stale actions, and revoked grants", async () => {
    await expect(transitionKitchenOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "PLACED", toStatus: "READY" })).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    database.tx.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(transitionKitchenOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "PLACED", toStatus: "ACCEPTED" })).rejects.toMatchObject({ code: "STALE_ORDER_STATE" });
    expect(database.tx.orderStatusEvent.create).not.toHaveBeenCalled();
    database.tx.user.findUnique.mockResolvedValue({ active: false, memberships: [] });
    await expect(transitionKitchenOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "PLACED", toStatus: "ACCEPTED" })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("uses current PostgreSQL grants rather than stale actor access", async () => {
    await transitionKitchenOrderRecord({ actor: { ...actor, role: "CINEMA_ADMIN", allLocations: true }, publicCode: "CB-12AB34CD56", expectedStatus: "PLACED", toStatus: "ACCEPTED" });
    expect(database.tx.order.findFirst).toHaveBeenCalledWith({ where: { organizationId: "org-a", publicOrderCode: "CB-12AB34CD56", locationId: { in: ["beirut"] } } });
    expect(database.tx.auditLog.create.mock.calls[0][0].data.metadata).toEqual({ publicOrderCode: "CB-12AB34CD56", fromStatus: "PLACED", toStatus: "ACCEPTED" });
  });

  it("maps serializable race errors into a safe conflict", async () => {
    database.prisma.$transaction.mockRejectedValue({ code: "P2034" });
    await expect(transitionKitchenOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "PLACED", toStatus: "ACCEPTED" })).rejects.toMatchObject({ code: "STALE_ORDER_STATE", status: 409 });
  });

  it("queries queue and history with tenant/location scope and oldest-first bounded pages", async () => {
    database.tx.order.groupBy.mockResolvedValue([{ status: "PLACED", _count: { _all: 1 } }]);
    database.tx.order.findMany.mockResolvedValue([]);
    const queue = await getKitchenQueueRecord(actor, { page: 2 });
    expect(queue.counts.PLACED).toBe(1);
    expect(database.tx.order.findMany).toHaveBeenCalledTimes(4);
    expect(database.tx.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-a", OR: [{ locationId: "beirut" }], status: "PLACED" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: 25, take: 25 }));
    await expect(buildOrderQueueWhere(actor, { page: 1, locationId: "dbayeh" })).rejects.toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
    database.prisma.order.findFirst.mockResolvedValue(null);
    await expect(getKitchenOrderRecord(actor, "CB-12AB34CD56")).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    expect(database.prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-a", publicOrderCode: "CB-12AB34CD56", locationId: { in: ["beirut"] } } }));
  });

  it("uses immutable item/context snapshots and preserves cancelled screening orders", () => {
    const dto = kitchenOrderDto(row("READY") as unknown as Parameters<typeof kitchenOrderDto>[0]);
    expect(dto.items[0].productName).toBe("Original Popcorn");
    expect(dto.hallName).toBe("Original Hall");
    expect(dto.screeningWarning).toContain("Screening cancelled");
    expect(dto.customerNote).toBe("<script>alert(1)</script>");
    expect(dto).not.toHaveProperty("customerSessionId");
  });
});
