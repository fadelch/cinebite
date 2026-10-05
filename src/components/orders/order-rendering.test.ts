import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KitchenOrderDetail } from "@/components/kitchen/kitchen-order-detail";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { CustomerOrderProgress } from "@/components/customer/order-progress";
import type { KitchenOrder } from "@/types/order";

const order: KitchenOrder = {
  publicOrderCode: "CB-12AB34CD56", status: "READY", currencyCode: "USD", subtotal: "5.00", total: "5.00",
  customerNote: "<script>alert(1)</script>", locationName: "Beirut", hallName: "Original Hall", seatLabel: "A7", movieTitle: "Interstellar",
  screeningStartsAt: "2026-10-05T12:00:00Z", createdAt: "2026-10-05T12:00:00Z", timezone: "Asia/Beirut", screeningWarning: null,
  items: [{ productName: "Original Popcorn", imageUrl: null, quantity: 1, unitPrice: "5.00", lineTotal: "5.00", currencyCode: "USD" }],
  history: [{ fromStatus: null, toStatus: "PLACED", actorType: "CUSTOMER", createdAt: "2026-10-05T12:00:00Z" }, { fromStatus: "PLACED", toStatus: "ACCEPTED", actorType: "STAFF", actorDisplayName: "Kitchen Team", createdAt: "2026-10-05T12:01:00Z" }],
};

describe("order snapshot and timeline rendering", () => {
  it.each([
    ["PLACED", "We received your order"],
    ["ACCEPTED", "The kitchen accepted your order"],
    ["PREPARING", "Your order is being prepared"],
    ["READY", "Your order is ready"],
  ] as const)("renders customer %s progress without staff identity or delivery claims", (status, heading) => {
    const html = renderToStaticMarkup(createElement(CustomerOrderProgress, { initialOrder: { ...order, status } }));
    expect(html).toContain(heading);
    expect(html).not.toContain("Kitchen Team");
    expect(html).not.toContain("Delivered");
    expect(html).toContain('aria-current="step"');
  });
  it("renders original snapshots and treats customer notes as escaped text", () => {
    const html = renderToStaticMarkup(createElement(KitchenOrderDetail, { order }));
    expect(html).toContain("Original Popcorn");
    expect(html).toContain("Original Hall");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("hides staff names from the customer timeline and preserves timestamp order", () => {
    const html = renderToStaticMarkup(createElement(OrderTimeline, { history: order.history, timezone: order.timezone }));
    expect(html).not.toContain("Kitchen Team");
    expect(html.indexOf("Order received")).toBeLessThan(html.indexOf("Accepted"));
    expect(html).toContain("Asia/Beirut");
  });
});
