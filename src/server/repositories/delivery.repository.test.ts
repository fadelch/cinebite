import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => {
  const tx = { user: { findUnique: vi.fn() }, order: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), count: vi.fn() }, orderStatusEvent: { create: vi.fn() }, auditLog: { create: vi.fn() } };
  return { tx, prisma: { $transaction: vi.fn(), location: { findMany: vi.fn() }, order: { findFirst: vi.fn() } } };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db.prisma }));
import { Prisma } from "@/generated/prisma/client";
import { buildDeliveryQueueWhere, deliveryOrderDto, getDeliveryOrderRecord, getDeliveryQueueRecord, transitionDeliveryOrderRecord } from "@/server/repositories/delivery.repository";
import type { DeliveryActor } from "@/server/services/delivery-access";
import type { OrderStatus } from "@/types/order";
const time = new Date("2026-10-05T12:00:00Z");
const actor: DeliveryActor = { uid: "firebase-a", userId: "worker-a", role: "DELIVERY_STAFF", email: "demo@example.com", displayName: "Demo", organizationId: "org-a", locationIds: ["beirut"], allLocations: false, active: true };
function row(status: OrderStatus = "READY", assigned: string | null = null) {
  return { id: "order", organizationId: "org-a", locationId: "beirut", hallId: "hall", publicOrderCode: "CB-12AB34CD56", status, deliveryAssignedUserId: assigned,
    paymentPolicy: "LEGACY_NOT_REQUIRED", fulfillmentEligible: true,
    readyAt: time, deliveryClaimedAt: assigned ? time : null, deliveredAt: status === "DELIVERED" ? time : null, deliveryAssignedUser: assigned ? { displayName: "Private worker" } : null,
    subtotal: new Prisma.Decimal("5"), total: new Prisma.Decimal("5"), currencyCode: "USD", customerNote: "<script>unsafe()</script>",
    locationNameSnapshot: "Demo Beirut", hallNameSnapshot: "Original Hall", seatLabelSnapshot: "A7", movieTitleSnapshot: "Interstellar", screeningStartsAt: time, createdAt: time,
    location: { timezone: "Asia/Beirut" }, screening: { status: "CANCELLED", endsAt: time },
    statusEvents: [{ fromStatus: "PREPARING", toStatus: "READY", actorType: "STAFF", createdAt: time, actor: null }],
    items: [{ productNameSnapshot: "Original Popcorn", productImageSnapshot: null, quantity: 1, unitPrice: new Prisma.Decimal("5"), lineTotal: new Prisma.Decimal("5"), currencyCode: "USD" }] };
}
describe("delivery persistence and atomic transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.prisma.$transaction.mockImplementation(async (fn: (tx: typeof db.tx) => unknown) => fn(db.tx));
    db.tx.user.findUnique.mockResolvedValue({ id: "worker-a", active: true, memberships: [{ role: "DELIVERY_STAFF", allLocations: false, locationAccess: [{ locationId: "beirut" }], organization: { status: "ACTIVE" } }] });
    db.tx.order.findFirst.mockResolvedValue(row());
    db.tx.order.updateMany.mockResolvedValue({ count: 1 });
    db.tx.orderStatusEvent.create.mockResolvedValue({ createdAt: time });
    db.tx.order.findUniqueOrThrow.mockResolvedValue(row("OUT_FOR_DELIVERY", "worker-a"));
    db.prisma.location.findMany.mockResolvedValue([{ id: "beirut", name: "Beirut", timezone: "Asia/Beirut" }]);
    db.tx.order.findMany.mockResolvedValue([]); db.tx.order.count.mockResolvedValue(0);
  });
  it("claims READY with conditional null assignment, database time, event and audit in one serializable transaction", async () => {
    const result = await transitionDeliveryOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" });
    expect(result.assignedToMe).toBe(true); expect(result.canDeliver).toBe(true);
    expect(db.tx.order.updateMany).toHaveBeenCalledWith({ where: { id: "order", organizationId: "org-a", locationId: "beirut", status: "READY", deliveryAssignedUserId: null }, data: { status: "OUT_FOR_DELIVERY", deliveryAssignedUserId: "worker-a", deliveryClaimedAt: time } });
    expect(db.tx.orderStatusEvent.create.mock.calls[0][0].data).not.toHaveProperty("createdAt");
    expect(db.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ORDER_CLAIMED_FOR_DELIVERY", actorUserId: "worker-a" }) });
    expect(db.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(Object.keys(db.tx)).not.toContain("locationInventory"); expect(Object.keys(db.tx)).not.toContain("inventoryMovement"); expect(Object.keys(db.tx)).not.toContain("orderItem");
  });
  it("delivers only the assigned worker using expected state AND ownership condition", async () => {
    db.tx.order.findFirst.mockResolvedValue(row("OUT_FOR_DELIVERY", "worker-a"));
    db.tx.order.findUniqueOrThrow.mockResolvedValue(row("DELIVERED", "worker-a"));
    const result = await transitionDeliveryOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" });
    expect(result.deliveredAt).toBe(time.toISOString());
    expect(db.tx.order.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ status: "OUT_FOR_DELIVERY", deliveryAssignedUserId: "worker-a" }), data: { status: "DELIVERED", deliveredAt: time } });
    expect(db.tx.auditLog.create.mock.calls[0][0].data.action).toBe("ORDER_DELIVERED");
  });
  it("rejects second worker, double claim, already delivered and skips without new events", async () => {
    db.tx.order.findFirst.mockResolvedValue(row("OUT_FOR_DELIVERY", "worker-b"));
    await expect(transitionDeliveryOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" })).rejects.toMatchObject({ code: "NOT_ASSIGNED_TO_YOU" });
    await expect(transitionDeliveryOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" })).rejects.toMatchObject({ code: "ORDER_ALREADY_CLAIMED" });
    db.tx.order.findFirst.mockResolvedValue(row("DELIVERED", "worker-a"));
    await expect(transitionDeliveryOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" })).rejects.toMatchObject({ code: "ORDER_ALREADY_DELIVERED" });
    await expect(transitionDeliveryOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "READY", toStatus: "DELIVERED" })).rejects.toMatchObject({ code: "INVALID_DELIVERY_TRANSITION" });
    expect(db.tx.orderStatusEvent.create).not.toHaveBeenCalled();
  });
  it("maps concurrent unique-event/serializable failures to safe conflicts", async () => {
    for (const code of ["P2002", "P2034"]) {
      db.prisma.$transaction.mockRejectedValueOnce({ code });
      await expect(transitionDeliveryOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" })).rejects.toMatchObject({ status: 409, code: "ORDER_ALREADY_CLAIMED" });
    }
  });
  it("serializes competing workers into exactly one owner/event/audit and rejects the duplicate claim", async () => {
    let stored = row();
    let lock = Promise.resolve();
    db.prisma.$transaction.mockImplementation(async (fn: (tx: typeof db.tx) => unknown) => {
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await fn(db.tx); } finally { release(); }
    });
    db.tx.user.findUnique.mockImplementation(async ({ where }: { where: { firebaseUid: string } }) => ({ id: where.firebaseUid === "firebase-a" ? "worker-a" : "worker-b", active: true,
      memberships: [{ role: "DELIVERY_STAFF", allLocations: false, locationAccess: [{ locationId: "beirut" }], organization: { status: "ACTIVE" } }] }));
    db.tx.order.findFirst.mockImplementation(async () => ({ ...stored }));
    db.tx.order.updateMany.mockImplementation(async ({ where, data }: { where: { status: string; deliveryAssignedUserId: string | null }; data: { status: OrderStatus; deliveryAssignedUserId: string } }) => {
      if (stored.status !== where.status || stored.deliveryAssignedUserId !== where.deliveryAssignedUserId) return { count: 0 };
      stored = row(data.status, data.deliveryAssignedUserId); return { count: 1 };
    });
    db.tx.order.findUniqueOrThrow.mockImplementation(async () => stored);
    const responses = await Promise.allSettled([actor, { ...actor, uid: "firebase-b", userId: "worker-b" }].map((worker) => transitionDeliveryOrderRecord({ actor: worker, publicCode: "CB-12AB34CD56", expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" })));
    expect(responses.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(responses.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(stored.deliveryAssignedUserId).toBe("worker-a");
    expect(db.tx.orderStatusEvent.create).toHaveBeenCalledTimes(1); expect(db.tx.auditLog.create).toHaveBeenCalledTimes(1);
    await expect(transitionDeliveryOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" })).rejects.toMatchObject({ code: "ORDER_ALREADY_CLAIMED" });
    expect(db.tx.orderStatusEvent.create).toHaveBeenCalledTimes(1);
  });
  it("rechecks DB role, active membership and grants rather than stale cookie profile", async () => {
    db.tx.user.findUnique.mockResolvedValueOnce({ id: "worker-a", active: true, memberships: [{ role: "KITCHEN_STAFF", allLocations: false, locationAccess: [], organization: { status: "ACTIVE" } }] });
    await expect(transitionDeliveryOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" })).rejects.toMatchObject({ status: 403 });
    db.tx.user.findUnique.mockResolvedValueOnce({ active: false, memberships: [] });
    await expect(transitionDeliveryOrderRecord({ actor, publicCode: "CB-12AB34CD56", expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" })).rejects.toMatchObject({ status: 403 });
    db.tx.order.findFirst.mockResolvedValueOnce(null);
    await expect(transitionDeliveryOrderRecord({ actor, publicCode: "foreign-code", expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" })).rejects.toMatchObject({ status: 404 });
    expect(db.tx.order.findFirst).toHaveBeenCalledWith({ where: { organizationId: "org-a", publicOrderCode: "foreign-code", locationId: { in: ["beirut"] } } });
    expect(db.tx.orderStatusEvent.create).not.toHaveBeenCalled();
  });
  it("bounds each queue, sorts by READY time, and limits active/history to own assignment", async () => {
    await getDeliveryQueueRecord(actor, { page: 2 });
    expect(db.tx.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "READY", deliveryAssignedUserId: null }), orderBy: [{ readyAt: "asc" }, { id: "asc" }], take: 20, skip: 20 }));
    expect(db.tx.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "OUT_FOR_DELIVERY", deliveryAssignedUserId: "worker-a" }), take: 20, skip: 20 }));
    expect(db.tx.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "DELIVERED", deliveryAssignedUserId: "worker-a" }), orderBy: [{ deliveredAt: "desc" }, { id: "desc" }], take: 20, skip: 20 }));
  });
  it("filters supervisor history in location timezone without hiding active work", async () => {
    await getDeliveryQueueRecord({ ...actor, role: "LOCATION_MANAGER" }, { page: 1, date: "2026-10-05", hall: "Original", code: "CB-", staffId: "worker-b" });
    const calls = db.tx.order.findMany.mock.calls.map((c) => c[0]);
    expect(calls[0].where.OR).toEqual([{ locationId: "beirut" }]);
    expect(calls[2].where.OR[0].deliveredAt).toHaveProperty("gte");
    expect(calls[2].where.deliveryAssignedUserId).toBe("worker-b");
    expect(calls[2].where.organizationId).toBe("org-a");
    await expect(buildDeliveryQueueWhere(actor, { page: 1, staffId: "worker-b" })).rejects.toMatchObject({ status: 403 });
    await expect(buildDeliveryQueueWhere(actor, { page: 1, locationId: "dbayeh" })).rejects.toMatchObject({ code: "UNAUTHORIZED_LOCATION" });
  });
  it("public codes alone never bypass organization/location/assignment restrictions", async () => {
    db.prisma.order.findFirst.mockResolvedValue(null);
    await expect(getDeliveryOrderRecord(actor, "CB-12AB34CD56")).rejects.toMatchObject({ status: 404 });
    expect(db.prisma.order.findFirst.mock.calls[0][0].where).toMatchObject({ organizationId: "org-a", locationId: { in: ["beirut"] }, OR: [{ status: "READY", deliveryAssignedUserId: null }, { status: { in: ["OUT_FOR_DELIVERY", "DELIVERED"] }, deliveryAssignedUserId: "worker-a" }] });
  });
  it("preserves snapshots and assignment across reads regardless of expired screening/customer session", () => {
    const dto = deliveryOrderDto(row("OUT_FOR_DELIVERY", "worker-a") as unknown as Parameters<typeof deliveryOrderDto>[0], actor);
    expect(dto.hallName).toBe("Original Hall"); expect(dto.items[0].productName).toBe("Original Popcorn"); expect(dto.seatLabel).toBe("A7");
    expect(dto.screeningWarning).toContain("cancelled"); expect(dto.canDeliver).toBe(true); expect(dto.assignedToMe).toBe(true);
    expect(dto.assignedStaffName).toBeNull();
    for (const secret of ["id", "deliveryAssignedUserId", "customerSessionId", "firebaseUid", "token"]) expect(dto).not.toHaveProperty(secret);
  });
});
