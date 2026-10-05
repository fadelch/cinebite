import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { deliveryQueueQuerySchema, deliveryTransitionSchema } from "@/validation/delivery";
describe("strict delivery contracts", () => {
  for (const from of ORDER_STATUSES) for (const to of ORDER_STATUSES) it(`${from} → ${to}`, () => {
    expect(deliveryTransitionSchema.safeParse({ expectedStatus: from, toStatus: to }).success).toBe((from === "READY" && to === "OUT_FOR_DELIVERY") || (from === "OUT_FOR_DELIVERY" && to === "DELIVERED"));
  });
  it("rejects client identities, timestamps and commercial or destination edits", () => {
    for (const key of ["deliveryAssignedUserId", "deliveryClaimedAt", "deliveredAt", "userId", "role", "organizationId", "locationId", "total", "quantity", "seatId", "hallId", "screeningId"]) {
      expect(deliveryTransitionSchema.safeParse({ expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY", [key]: "tampered" }).success).toBe(false);
    }
  });
  it("bounds pages and validates history filters", () => {
    expect(deliveryQueueQuerySchema.parse({ page: "2", date: "2026-10-05", hall: "Hall 1", code: "CB-", staffId: "worker" }).page).toBe(2);
    for (const page of [0, -1, 10001, 1.5]) expect(deliveryQueueQuerySchema.safeParse({ page }).success).toBe(false);
    expect(deliveryQueueQuerySchema.safeParse({ status: "PLACED" }).success).toBe(false);
  });
});
