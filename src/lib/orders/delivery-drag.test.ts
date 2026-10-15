import { describe, expect, it } from "vitest";
import { deliveryDropOrder, type DeliveryColumn } from "./delivery-drag";
import type { DeliveryOrder, OrderStatus } from "@/types/order";

const order = { publicOrderCode: "CB-12AB34CD56", status: "READY", canClaim: true, canDeliver: false, assignedToMe: false } as DeliveryOrder;
const states: OrderStatus[] = ["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"];
const columns: DeliveryColumn[] = ["ready", "active", "delivered"];
describe("delivery drop controls", () => {
  it.each(states.flatMap(status => columns.map(target => ({ status, target }))))("allows only the next authorized step: $status → $target", ({ status, target }) => {
    const row = { ...order, status, canDeliver: true, assignedToMe: true };
    const allowed = status === "READY" && target === "active" || status === "OUT_FOR_DELIVERY" && target === "delivered";
    expect(deliveryDropOrder([row], row, target, false)).toBe(allowed ? row : null);
  });
  it("denies another worker, supervisor, stale snapshot, external drag and busy queue", () => {
    const active = { ...order, status: "OUT_FOR_DELIVERY" as const, canClaim: false, canDeliver: true, assignedToMe: true };
    expect(deliveryDropOrder([{ ...active, assignedToMe: false }], active, "delivered", false)).toBeNull();
    expect(deliveryDropOrder([{ ...order, canClaim: false }], order, "active", false)).toBeNull();
    expect(deliveryDropOrder([active], order, "active", false)).toBeNull();
    expect(deliveryDropOrder([order], null, "active", false)).toBeNull();
    expect(deliveryDropOrder([], order, "active", false)).toBeNull();
    expect(deliveryDropOrder([order], order, "active", true)).toBeNull();
  });
});
