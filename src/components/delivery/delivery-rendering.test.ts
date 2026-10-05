import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeliveryOrderCard } from "@/components/delivery/delivery-order-card";
import type { DeliveryOrder } from "@/types/order";
const order: DeliveryOrder = {
  publicOrderCode: "CB-12AB34CD56", status: "OUT_FOR_DELIVERY", currencyCode: "USD", subtotal: "10.00", total: "10.00", customerNote: "<script>alert(1)</script>",
  locationName: "Demo Beirut", hallName: "Original Hall", seatLabel: "A7", movieTitle: "Interstellar", screeningStartsAt: "2026-10-05T12:00:00Z", createdAt: "2026-10-05T12:00:00Z",
  timezone: "Asia/Beirut", history: [], screeningWarning: "Screening ended — this order still requires delivery.", readyAt: "2026-10-05T12:01:00Z", deliveryClaimedAt: "2026-10-05T12:02:00Z", deliveredAt: null,
  assignedToMe: true, assignedStaffName: null, canClaim: false, canDeliver: true,
  items: [{ productName: "Original Popcorn", quantity: 2, imageUrl: null, unitPrice: "5.00", lineTotal: "10.00", currencyCode: "USD" }],
};
describe("mobile delivery cards", () => {
  function html(value: DeliveryOrder, expanded = false) { return renderToStaticMarkup(createElement(DeliveryOrderCard, { order: value, expanded, now: "2026-10-05T12:03:00Z", busy: false, action: () => {}, open: () => {} })); }
  it("shows immutable Hall/Seat and quantities prominently and escapes notes", () => {
    const result = html(order); expect(result).toContain("Original Hall"); expect(result).toContain("A7"); expect(result).toContain("Original Popcorn");
    expect(result).toContain("&lt;script&gt;alert(1)&lt;/script&gt;"); expect(result).not.toContain("<script>"); expect(result).toContain("Mark delivered");
    expect(result).toContain("Claimed 1 min ago"); expect(result).toContain("Screening ended");
  });
  it("offers claim only for an authorized unassigned READY order", () => {
    expect(html({ ...order, status: "READY", canClaim: true, canDeliver: false, assignedToMe: false })).toContain("Claim delivery");
    const supervisor = html({ ...order, canClaim: false, canDeliver: false, assignedStaffName: "Demo Worker" });
    expect(supervisor).toContain("Supervisor view"); expect(supervisor).not.toContain("Mark delivered");
  });
  it("keeps history compact but retains all snapshots and notes in the expanded delivered ticket", () => {
    const delivered = { ...order, status: "DELIVERED" as const, deliveredAt: "2026-10-05T12:03:00Z", canDeliver: false };
    expect(html(delivered)).toContain("Delivered to seat"); expect(html(delivered)).not.toContain("Mark delivered");
    expect(html(delivered, true)).toContain("Original Popcorn"); expect(html(delivered, true)).toContain("&lt;script&gt;");
  });
});
