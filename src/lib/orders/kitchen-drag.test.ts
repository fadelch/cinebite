import { describe, expect, it } from "vitest";
import { kitchenDropOrder } from "./kitchen-drag";
import type { KitchenOrder, KitchenStatus, OrderStatus } from "@/types/order";

const order = { publicOrderCode: "CB-12AB34CD56", status: "PLACED" } as KitchenOrder;
const dragged = { publicOrderCode: order.publicOrderCode, status: order.status };
const statuses: OrderStatus[] = ["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"];
const targets: KitchenStatus[] = ["PLACED", "ACCEPTED", "PREPARING", "READY"];
describe("kitchen drop safety", () => {
  it.each(statuses.flatMap(from => targets.map(to => ({ from, to }))))("checks $from → $to", ({ from, to }) => {
    const snapshot = { ...order, status: from };
    const allowed = ["PLACED:ACCEPTED", "ACCEPTED:PREPARING", "PREPARING:READY"].includes(`${from}:${to}`);
    expect(kitchenDropOrder([snapshot], { ...dragged, status: from }, to, false)).toBe(allowed ? snapshot : null);
  });
  it("rejects foreign, removed and concurrently changed orders", () => {
    expect(kitchenDropOrder([order], null, "ACCEPTED", false)).toBeNull();
    expect(kitchenDropOrder([order], { ...dragged, publicOrderCode: "CB-FOREIGN" }, "ACCEPTED", false)).toBeNull();
    expect(kitchenDropOrder([], dragged, "ACCEPTED", false)).toBeNull();
    expect(kitchenDropOrder([{ ...order, status: "ACCEPTED" }], dragged, "ACCEPTED", false)).toBeNull();
  });
  it("blocks pending writes and unavailable queue data", () => {
    expect(kitchenDropOrder([order], dragged, "ACCEPTED", true)).toBeNull();
  });
});
