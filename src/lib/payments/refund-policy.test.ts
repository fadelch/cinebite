import { describe, expect, it } from "vitest";
import { canAdvanceRefund, customerMayCancel, refundableBalance, staffMayCancel } from "./refund-policy";
import { isOrderEligibleForFulfillment, paymentMinorUnits } from "./policy";
import { cancelSchema, customerCancelSchema, issueSchema, refundSchema, resolveIssueSchema } from "@/validation/cancellation";
import { isValidOrderTransition } from "@/lib/orders/status";

describe("Phase 15 policy boundaries", () => {
  it.each(["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"])("customer cannot cancel %s", status => expect(customerMayCancel(status)).toBe(false));
  it("placed cancellation and explicit staff exceptions", () => {
    expect(customerMayCancel("PLACED")).toBe(true);
    for (const status of ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"]) {
      expect(staffMayCancel(status, false)).toBe(false); expect(staffMayCancel(status, true)).toBe(true);
    }
    expect(staffMayCancel("DELIVERED", true)).toBe(false); expect(staffMayCancel("CANCELED", true)).toBe(false);
  });
  it.each(["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as const)("CANCELED cannot advance to %s", status => {
    expect(isValidOrderTransition("CANCELED", status)).toBe(false);
    expect(isOrderEligibleForFulfillment({ status: "CANCELED", paymentPolicy: "LEGACY_NOT_REQUIRED" })).toBe(false);
  });
  it("reserves pending/processing exposure without floating point", () => {
    expect(refundableBalance("12.50", [{ amount: "2.50", status: "SUCCEEDED" }, { amount: "5.00", status: "PROCESSING" }])).toEqual({ refundedAmount: "2.50", processingAmount: "5.00", remainingRefundableAmount: "5.00", fullyRefunded: false });
    expect(refundableBalance("0.30", [{ amount: "0.10", status: "SUCCEEDED" }, { amount: "0.20", status: "SUCCEEDED" }]).fullyRefunded).toBe(true);
    expect(refundableBalance("10.00", [{ amount: "8.00", status: "PENDING" }]).remainingRefundableAmount).toBe("2.00");
  });
  it("confirmed terminal failures/cancellations free exposure but retain history", () => {
    expect(refundableBalance("12.50", [{ amount: "12.50", status: "FAILED" }, { amount: "12.50", status: "CANCELED" }]).remainingRefundableAmount).toBe("12.50");
  });
  it.each(["SUCCEEDED", "FAILED", "CANCELED"] as const)("%s refunds are terminal", status => {
    for (const next of ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELED"] as const) expect(canAdvanceRefund(status, next)).toBe(false);
  });
  it("only forward refund transitions", () => {
    expect(canAdvanceRefund("PENDING", "PROCESSING")).toBe(true); expect(canAdvanceRefund("PROCESSING", "SUCCEEDED")).toBe(true); expect(canAdvanceRefund("PROCESSING", "PENDING")).toBe(false);
    expect(paymentMinorUnits("04.00", "USD")).toBe("400");
  });
  it("confirmation, structured reasons, lengths and strict authoritative boundaries", () => {
    expect(customerCancelSchema.safeParse({ confirmed: false }).success).toBe(false);
    expect(customerCancelSchema.safeParse({ confirmed: true, amount: "1000", sessionId: "other" }).success).toBe(false);
    expect(cancelSchema.safeParse({ confirmed: true, reasonCode: "OTHER", reasonNote: "x".repeat(301) }).success).toBe(false);
    expect(refundSchema.safeParse({ confirmed: true, kind: "PARTIAL", amount: "2.501", idempotencyKey: crypto.randomUUID(), reasonCode: "OTHER" }).success).toBe(false);
    expect(refundSchema.safeParse({ confirmed: true, kind: "FULL", idempotencyKey: crypto.randomUUID(), reasonCode: "OTHER", providerPaymentId: "fake" }).success).toBe(false);
    expect(issueSchema.safeParse({ type: "OTHER", note: "<script>alert(1)</script>" }).success).toBe(true); // escaped by React, never interpreted as markup
    expect(resolveIssueSchema.safeParse({ issueId: "one", resolution: "   " }).success).toBe(false);
  });
});
