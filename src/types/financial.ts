export interface FinancialSummary {
  status: string; canCancel: boolean; currencyCode: string; paymentStatus: string; paidAmount: string;
  refundedAmount: string; processingAmount: string; remainingRefundableAmount: string; fullyRefunded: boolean;
  cancellation: null | { fromStatus: string; reasonCode: string; reasonNote?: string | null; initiatedByType?: string; inventoryDisposition: string; createdAt: string };
  refunds: Array<{ id?: string; status: string; amount: string; currencyCode: string; reasonCode: string; reasonNote?: string | null; initiatedByType?: string; createdAt: string; succeededAt: string | null; retryOfId?: string | null; retryStatus?: string | null }>;
  issues: Array<{ id: string; type: string; status: string; note: string | null; resolution: string | null; createdAt: string; resolvedAt: string | null }>;
}
