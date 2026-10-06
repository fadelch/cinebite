-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('CUSTOMER_REQUEST', 'SCREENING_CANCELED', 'ITEM_UNAVAILABLE', 'OPERATIONAL_ISSUE', 'DELIVERY_ISSUE', 'DUPLICATE_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryDisposition" AS ENUM ('NONE', 'RESERVATION_RELEASED', 'HOLD_UNTIL_PROVIDER_FINAL', 'AUTO_RESTOCKED', 'NO_AUTO_RESTOCK');

-- CreateEnum
CREATE TYPE "OrderIssueType" AS ENUM ('CUSTOMER_UNAVAILABLE', 'WRONG_SEAT_CONTEXT', 'ORDER_DAMAGED', 'ITEM_MISSING', 'SCREENING_CANCELED', 'PAYMENT_REFUND_FAILED', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'ORDER_CANCELLATION_RESTOCK';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CANCELED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ORDER_CANCELED';
ALTER TYPE "AuditAction" ADD VALUE 'REFUND_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'REFUND_SUCCEEDED';
ALTER TYPE "AuditAction" ADD VALUE 'REFUND_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_ISSUE_REPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_ISSUE_RESOLVED';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_RESTORED_FOR_CANCELLATION';
ALTER TYPE "AuditAction" ADD VALUE 'SCREENING_ORDER_RECONCILED';

-- CreateTable
CREATE TABLE "order_cancellations" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus" NOT NULL,
    "initiatedByType" "OrderStatusActorType" NOT NULL,
    "initiatedByUserId" TEXT,
    "reasonCode" "CancellationReason" NOT NULL,
    "reasonNote" VARCHAR(300),
    "inventoryDisposition" "InventoryDisposition" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "reasonCode" "CancellationReason" NOT NULL,
    "reasonNote" VARCHAR(300),
    "initiatedByType" "OrderStatusActorType" NOT NULL,
    "initiatedByUserId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "retryOfId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "succeededAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_issues" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderIssueType" NOT NULL,
    "status" "OrderIssueStatus" NOT NULL DEFAULT 'OPEN',
    "reportedByUserId" TEXT,
    "note" VARCHAR(300),
    "deduplicationKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedByUserId" TEXT,
    "resolution" VARCHAR(300),

    CONSTRAINT "order_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_refund_intents" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "amountMinor" TEXT NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sandbox_refund_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_cancellations_orderId_key" ON "order_cancellations"("orderId");

-- CreateIndex
CREATE INDEX "order_cancellations_initiatedByUserId_idx" ON "order_cancellations"("initiatedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_providerRefundId_key" ON "refunds"("providerRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_retryOfId_key" ON "refunds"("retryOfId");

-- CreateIndex
CREATE INDEX "refunds_orderId_createdAt_idx" ON "refunds"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "refunds_status_updatedAt_idx" ON "refunds"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_paymentId_idempotencyKey_key" ON "refunds"("paymentId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "order_issues_deduplicationKey_key" ON "order_issues"("deduplicationKey");

-- CreateIndex
CREATE INDEX "order_issues_orderId_status_createdAt_idx" ON "order_issues"("orderId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sandbox_refund_intents_refundId_key" ON "sandbox_refund_intents"("refundId");

-- CreateIndex
CREATE INDEX "sandbox_refund_intents_providerPaymentId_idx" ON "sandbox_refund_intents"("providerPaymentId");

-- AddForeignKey
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_issues" ADD CONSTRAINT "order_issues_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_issues" ADD CONSTRAINT "order_issues_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_issues" ADD CONSTRAINT "order_issues_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
