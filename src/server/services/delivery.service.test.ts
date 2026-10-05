import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ current: vi.fn(), user: vi.fn(), queue: vi.fn(), detail: vi.fn(), transition: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: deps.current }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: deps.user } } }));
vi.mock("@/server/repositories/delivery.repository", () => ({ getDeliveryQueueRecord: deps.queue, getDeliveryOrderRecord: deps.detail, transitionDeliveryOrderRecord: deps.transition, listDeliveryLocationsRecord: vi.fn(), listDeliveryStaffRecord: vi.fn() }));
import { getDeliveryOrder, getDeliveryQueue, transitionDeliveryOrder } from "@/server/services/delivery.service";
describe("delivery services require verified staff identity", () => {
  beforeEach(() => { vi.clearAllMocks(); deps.current.mockResolvedValue(null); });
  it("anonymous customers and public codes cannot read or mutate delivery", async () => {
    await expect(getDeliveryOrder("CB-12AB34CD56")).rejects.toMatchObject({ status: 401 });
    await expect(getDeliveryQueue({})).rejects.toMatchObject({ status: 401 });
    await expect(transitionDeliveryOrder("CB-12AB34CD56", { expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" })).rejects.toMatchObject({ status: 401 });
    expect(deps.user).not.toHaveBeenCalled(); expect(deps.transition).not.toHaveBeenCalled();
  });
  it("takes database identity rather than accepting client staff, timestamps, or ownership", async () => {
    deps.current.mockResolvedValue({ uid: "firebase", role: "DELIVERY_STAFF", active: true, organizationId: "org", allLocations: false, locationIds: ["beirut"] });
    deps.user.mockResolvedValue({ id: "database-worker" });
    await transitionDeliveryOrder("CB-12AB34CD56", { expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" });
    expect(deps.transition).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: "database-worker", uid: "firebase" }) }));
    await expect(transitionDeliveryOrder("CB-12AB34CD56", { expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY", deliveredAt: "2026-10-05" })).rejects.toThrow();
    expect(deps.transition).toHaveBeenCalledTimes(1);
  });
});
