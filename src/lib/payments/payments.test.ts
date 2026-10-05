import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
import { canAdvancePayment, isOrderEligibleForFulfillment, paymentMinorUnits } from "./policy";
import { paymentConfig } from "./config";
import { getPaymentProvider, sandboxSignature } from "./provider";
import { projectedProductAvailability } from "@/lib/inventory/stock-calculations";
import { checkoutSchema } from "@/validation/order";
import { sandboxOutcomeSchema } from "@/validation/payment";

afterEach(() => vi.unstubAllEnvs());
function sandbox() { vi.stubEnv("PAYMENT_PROVIDER", "sandbox"); vi.stubEnv("PAYMENT_SANDBOX_ENABLED", "true"); vi.stubEnv("PAYMENT_PROVIDER_WEBHOOK_SECRET", "offline-test-only-ephemeral-secret-12345"); }
describe("payment authority, exact amounts and sandbox signature", () => {
  it.each([["12.50", "USD", "1250"], ["04.00", "USD", "400"], ["12.00", "JPY", "12"], ["12.50", "KWD", "12500"], ["9999999999.99", "USD", "999999999999"]])("converts %s %s exactly", (amount, currency, expected) => expect(paymentMinorUnits(amount, currency)).toBe(expected));
  it.each([["12.50", "JPY"], ["0.00", "USD"], ["1.001", "USD"], ["NaN", "USD"], ["1", "XYZ"], ["-1.00", "USD"]])("rejects %s %s", (amount, currency) => expect(() => paymentMinorUnits(amount, currency)).toThrow());
  it("respects terminal statuses and refuses backwards transitions", () => {
    expect(canAdvancePayment("PENDING", "SUCCEEDED")).toBe(true);
    expect(canAdvancePayment("PROCESSING", "FAILED")).toBe(true);
    for (const from of ["SUCCEEDED", "FAILED", "CANCELED"] as const) for (const to of ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELED"] as const) expect(canAdvancePayment(from, to)).toBe(false);
    expect(canAdvancePayment("PROCESSING", "PENDING")).toBe(false);
  });
  it("requires explicit legacy or verified online eligibility", () => {
    expect(isOrderEligibleForFulfillment({})).toBe(false);
    expect(isOrderEligibleForFulfillment({ paymentPolicy: "LEGACY_NOT_REQUIRED" })).toBe(true);
    expect(isOrderEligibleForFulfillment({ paymentPolicy: "ONLINE_REQUIRED", fulfillmentEligible: false })).toBe(false);
    expect(isOrderEligibleForFulfillment({ paymentPolicy: "ONLINE_REQUIRED", fulfillmentEligible: true })).toBe(true);
  });
  it("subtracts reservations from availability and does not reserve carts", () => {
    expect(projectedProductAvailability([{ quantityOnHand: "10.000", quantityReserved: "2.000", quantityRequired: "1.000" }])).toEqual({ state: "SUFFICIENT", projectedUnits: 8 });
    expect(projectedProductAvailability([{ quantityOnHand: "1", quantityReserved: "1", quantityRequired: "1" }])).toEqual({ state: "INSUFFICIENT", projectedUnits: 0 });
    expect(projectedProductAvailability([])).toEqual({ state: "NOT_TRACKED", projectedUnits: null });
  });
  it("fails closed for absent or unimplemented real providers", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "stripe"); expect(() => paymentConfig()).toThrow();
    sandbox(); vi.stubEnv("PAYMENT_SANDBOX_ENABLED", "false"); expect(() => getPaymentProvider()).toThrow();
  });
  it("authenticates raw payload before parsing, verifies timestamp, and rejects tampering", () => {
    sandbox(); const provider = getPaymentProvider();
    const raw = JSON.stringify({ eventId: "demo-event", attemptId: "demo-attempt", providerPaymentId: "demo-intent", amountMinor: "1250", currencyCode: "USD", status: "SUCCEEDED" });
    expect(provider.verifyWebhook(raw, sandboxSignature(raw)).status).toBe("SUCCEEDED");
    expect(() => provider.verifyWebhook(raw.replace("1250", "1"), sandboxSignature(raw))).toThrow();
    expect(() => provider.verifyWebhook(raw, sandboxSignature(raw, Math.floor(Date.now() / 1000) - 601))).toThrow();
    expect(() => provider.verifyWebhook("not JSON", null)).toThrow("Invalid payment signature");
    expect(() => provider.verifyWebhook("not JSON", sandboxSignature("not JSON"))).toThrow("Invalid payment event");
  });
  it("does not accept browser totals, currency, card data or claimed payment status", () => {
    for (const extra of [{ amount: "0.01" }, { currencyCode: "EUR" }, { cardNumber: "forbidden" }, { status: "SUCCEEDED" }]) expect(checkoutSchema.safeParse({ idempotencyKey: "offline-checkout-key-12345", ...extra }).success).toBe(false);
    expect(sandboxOutcomeSchema.safeParse({ outcome: "SUCCEEDED", amount: "0.01" }).success).toBe(false);
  });
});
