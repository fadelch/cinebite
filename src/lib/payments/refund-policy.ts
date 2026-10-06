import type { RefundStatus } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

export function refundableBalance(captured: string, refunds: readonly { amount: string; status: RefundStatus }[]) {
  let succeeded = new Prisma.Decimal(0), committed = new Prisma.Decimal(0);
  for (const refund of refunds) {
    if (refund.status === "SUCCEEDED") succeeded = succeeded.plus(refund.amount);
    if (["PENDING", "PROCESSING"].includes(refund.status)) committed = committed.plus(refund.amount);
  }
  return { refundedAmount: succeeded.toFixed(2), processingAmount: committed.toFixed(2),
    remainingRefundableAmount: Prisma.Decimal.max(0, new Prisma.Decimal(captured).minus(succeeded).minus(committed)).toFixed(2),
    fullyRefunded: succeeded.equals(captured) };
}
export function canAdvanceRefund(from: RefundStatus, to: RefundStatus) {
  return (from === "PENDING" && ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELED"].includes(to))
    || (from === "PROCESSING" && ["SUCCEEDED", "FAILED", "CANCELED"].includes(to));
}
export function customerMayCancel(status: string) { return status === "PLACED"; }
export function staffMayCancel(status: string, exceptional: boolean) {
  return status === "PLACED" || (exceptional && ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(status));
}
