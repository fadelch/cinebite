import { describe, expect, it } from "vitest";

import { cartItemUpdateSchema, checkoutSchema, orderCodeSchema } from "@/validation/order";

describe("customer order validation", () => {
  it("permits zero only as a remove intent and caps a cart line", () => {
    expect(cartItemUpdateSchema.parse({ productSlug: "large-popcorn", quantity: 0 }).quantity).toBe(0);
    expect(() => cartItemUpdateSchema.parse({ productSlug: "large-popcorn", quantity: -1 })).toThrow();
    expect(() => cartItemUpdateSchema.parse({ productSlug: "large-popcorn", quantity: 21 })).toThrow();
    expect(() => cartItemUpdateSchema.parse({ productSlug: "large-popcorn", quantity: 1.5 })).toThrow();
  });

  it("rejects all client-supplied authority fields", () => {
    const trusted = { idempotencyKey: "checkout_key_123456789" };
    expect(checkoutSchema.parse(trusted)).toEqual(trusted);
    for (const field of ["unitPrice", "total", "seatId", "locationId", "screeningId", "organizationId"]) {
      expect(() => checkoutSchema.parse({ ...trusted, [field]: "attacker-value" })).toThrow();
    }
  });

  it("accepts only non-secret public order codes", () => {
    expect(orderCodeSchema.parse("CB-12AB34CD56")).toBe("CB-12AB34CD56");
    expect(() => orderCodeSchema.parse("1")).toThrow();
  });
});
