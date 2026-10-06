import type { PaymentStatus } from "@/generated/prisma/client";

// Intentionally bounded sandbox currency policy; unknown currencies fail closed.
const minorDigits: Record<string, number> = { USD: 2, EUR: 2, GBP: 2, LBP: 2, CAD: 2, AUD: 2, CHF: 2, AED: 2, SAR: 2, JPY: 0, KWD: 3, BHD: 3 };
export function paymentMinorUnits(amount: string, currency: string): string {
  const digits = minorDigits[currency];
  if (digits === undefined || !/^\d+(?:\.\d{1,2})?$/.test(amount)) throw new Error("Unsupported payment money.");
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.slice(digits).replace(/0/g, "")) throw new Error("Currency does not support fractional amount.");
  const minor = BigInt(whole) * (BigInt(10) ** BigInt(digits)) + BigInt(fraction.slice(0, digits).padEnd(digits, "0") || "0");
  if (minor <= BigInt(0)) throw new Error("Payment must be positive.");
  return minor.toString();
}

export function canAdvancePayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return (from === "PENDING" && to !== "PENDING") || (from === "PROCESSING" && ["SUCCEEDED", "FAILED", "CANCELED"].includes(to));
}

export function isOrderEligibleForFulfillment(order: { status?: string; paymentPolicy?: string; fulfillmentEligible?: boolean }): boolean {
  return order.status !== "CANCELED" && (order.paymentPolicy === "LEGACY_NOT_REQUIRED" || (order.paymentPolicy === "ONLINE_REQUIRED" && order.fulfillmentEligible === true));
}
export const fulfillmentWhere = { status: { not: "CANCELED" as const }, OR: [{ paymentPolicy: "LEGACY_NOT_REQUIRED" as const }, { paymentPolicy: "ONLINE_REQUIRED" as const, fulfillmentEligible: true }] };
