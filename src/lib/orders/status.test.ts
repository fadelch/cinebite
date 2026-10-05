import { describe, expect, it } from "vitest";
import { elapsedOrderTime, isValidOrderTransition, KITCHEN_STATUSES, ORDER_STATUSES } from "@/lib/orders/status";
import { kitchenQueueQuerySchema, orderQueueQuerySchema, orderTransitionSchema } from "@/validation/kitchen";

describe("kitchen state machine", () => {
  for (const [index, from] of ORDER_STATUSES.entries()) {
    for (const to of ORDER_STATUSES) {
      it(`${from} → ${to} is ${ORDER_STATUSES[index + 1] === to ? "allowed" : "rejected"}`, () => {
        const valid = ORDER_STATUSES[index + 1] === to;
        expect(isValidOrderTransition(from, to)).toBe(valid);
        expect(orderTransitionSchema.safeParse({ expectedStatus: from, toStatus: to }).success).toBe(valid && KITCHEN_STATUSES.includes(to as typeof KITCHEN_STATUSES[number]));
      });
    }
  }
  it("rejects browser timestamps, identities and commercial edits", () => {
    for (const field of ["acceptedAt", "preparingAt", "readyAt", "role", "actorUserId", "total", "quantity", "seatId", "locationId", "organizationId"]) {
      expect(orderTransitionSchema.safeParse({ expectedStatus: "PLACED", toStatus: "ACCEPTED", [field]: "tampered" }).success).toBe(false);
    }
  });
  it("caps pages and validates operational filters", () => {
    expect(orderQueueQuerySchema.parse({ page: "2", status: "READY" }).page).toBe(2);
    expect(orderQueueQuerySchema.safeParse({ status: "DELIVERED" }).success).toBe(true);
    expect(kitchenQueueQuerySchema.safeParse({ status: "DELIVERED" }).success).toBe(false);
    expect(orderQueueQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
  it("derives elapsed age and clamps future/device skew", () => {
    const start = "2026-10-05T12:00:00Z";
    expect(elapsedOrderTime(start, Date.parse(start) + 120000)).toBe("2 min");
    expect(elapsedOrderTime(start, Date.parse(start) - 1000)).toBe("Just now");
  });
});
