import type { FinancialSummary } from "@/types/financial";
/** Explicit customer projection: staff free text and internal refund/issue references
 * are not customer-facing explanations. Admin summaries retain those fields. */
export function customerFinancialDto(
  summary: FinancialSummary,
): FinancialSummary {
  return {
    status: summary.status,
    canCancel: summary.canCancel,
    currencyCode: summary.currencyCode,
    paymentStatus: summary.paymentStatus,
    paidAmount: summary.paidAmount,
    refundedAmount: summary.refundedAmount,
    processingAmount: summary.processingAmount,
    remainingRefundableAmount: summary.remainingRefundableAmount,
    fullyRefunded: summary.fullyRefunded,
    cancellation: summary.cancellation
      ? {
          fromStatus: summary.cancellation.fromStatus,
          reasonCode: summary.cancellation.reasonCode,
          inventoryDisposition: summary.cancellation.inventoryDisposition,
          createdAt: summary.cancellation.createdAt,
        }
      : null,
    refunds: summary.refunds.map((refund) => ({
      status: refund.status,
      amount: refund.amount,
      currencyCode: refund.currencyCode,
      reasonCode: refund.reasonCode,
      createdAt: refund.createdAt,
      succeededAt: refund.succeededAt,
      retryStatus: refund.retryStatus,
    })),
    issues: [],
  };
}
