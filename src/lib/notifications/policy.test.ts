import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_TYPES,
  CATEGORIES,
  categoryFor,
  recipientsFor,
  mandatory,
  optionalEnabled,
  retryPolicy,
  severityFor,
  stockState,
  customerKinds,
} from "./policy";
import {
  notificationQuerySchema,
  preferenceSchema,
  readNotificationSchema,
} from "@/validation/notification";

describe("Phase 17 notification policy", () => {
  it("categorizes every controlled type without arbitrary identifiers", () => {
    for (const type of NOTIFICATION_TYPES)
      expect(CATEGORIES).toContain(categoryFor(type));
    expect(
      notificationQuerySchema.safeParse({ type: "CUSTOM_HTML" }).success,
    ).toBe(false);
  });
  it("routes kitchen and delivery events separately", () => {
    expect(recipientsFor("NEW_ORDER")).toEqual(["KITCHEN_STAFF"]);
    expect(recipientsFor("ORDER_READY")).toEqual(["DELIVERY_STAFF"]);
    expect(recipientsFor("REFUND_FAILED")).toEqual([
      "CINEMA_ADMIN",
      "LOCATION_MANAGER",
    ]);
    expect(customerKinds.has("ORDER_DELIVERED")).toBe(true);
    expect(customerKinds.has("LOW_STOCK")).toBe(false);
  });
  it("mandatory safety alerts bypass optional preferences", () => {
    for (const type of NOTIFICATION_TYPES)
      expect(optionalEnabled(type, false)).toBe(mandatory(type));
    expect(optionalEnabled("NEW_ORDER")).toBe(true);
    expect(severityFor("REFUND_FAILED")).toBe("CRITICAL");
    expect(severityFor("REFUND_SUCCEEDED")).toBe("SUCCESS");
  });
  it("uses available stock rather than physical on-hand alone", () => {
    expect(stockState(20, 0, 5)).toBe("IN_STOCK");
    expect(stockState(20, 15, 5)).toBe("LOW_STOCK");
    expect(stockState(20, 20, 5)).toBe("OUT_OF_STOCK");
  });
  it("caps delivery at five attempts with exponential backoff", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    expect(retryPolicy(1, now)).toEqual({
      status: "PENDING",
      nextAttemptAt: new Date(now.getTime() + 30000),
    });
    expect(retryPolicy(4, now).nextAttemptAt.getTime() - now.getTime()).toBe(
      240000,
    );
    expect(retryPolicy(5, now).status).toBe("FAILED");
  });
  it("requires exactly one read target and refuses user/tenant injection", () => {
    expect(readNotificationSchema.safeParse({}).success).toBe(false);
    expect(
      readNotificationSchema.safeParse({ id: "owned", all: true }).success,
    ).toBe(false);
    expect(
      readNotificationSchema.safeParse({ all: true, recipientUserId: "other" })
        .success,
    ).toBe(false);
    expect(readNotificationSchema.safeParse({ all: true }).success).toBe(true);
    expect(
      preferenceSchema.safeParse({
        category: "ORDERS",
        inAppEnabled: false,
        userId: "other",
      }).success,
    ).toBe(false);
    expect(notificationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(
      notificationQuerySchema.safeParse({ view: ["all", "unread"] }).success,
    ).toBe(false);
  });
});
