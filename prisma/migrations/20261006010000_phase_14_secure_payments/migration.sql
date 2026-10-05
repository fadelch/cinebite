-- CreateEnum
CREATE TYPE "OrderPaymentPolicy" AS ENUM ('LEGACY_NOT_REQUIRED', 'ONLINE_REQUIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_SUCCEEDED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_CANCELED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_REVIEW_REQUIRED';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_RESERVED';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_RESERVATION_RELEASED';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "paymentMode" "OrderPaymentPolicy" NOT NULL DEFAULT 'ONLINE_REQUIRED';

-- AlterTable
ALTER TABLE "location_inventory" ADD COLUMN     "quantityReserved" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "fulfillmentEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paymentPolicy" "OrderPaymentPolicy" NOT NULL DEFAULT 'LEGACY_NOT_REQUIRED';

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "currentAttemptNumber" INTEGER NOT NULL DEFAULT 1,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "succeededAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "canceledAt" TIMESTAMPTZ(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "succeededAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "canceledAt" TIMESTAMPTZ(3),

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "locationInventoryId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "releasedAt" TIMESTAMPTZ(3),
    "consumedAt" TIMESTAMPTZ(3),

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" "PaymentStatus" NOT NULL,
    "status" TEXT NOT NULL,
    "failureCode" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_payment_intents" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "amountMinor" TEXT NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sandbox_payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_orderId_key" ON "payments"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerPaymentId_key" ON "payments"("providerPaymentId");

-- CreateIndex
CREATE INDEX "payments_status_updatedAt_idx" ON "payments"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_providerPaymentId_key" ON "payment_attempts"("providerPaymentId");

-- CreateIndex
CREATE INDEX "payment_attempts_status_expiresAt_idx" ON "payment_attempts"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_paymentId_number_key" ON "payment_attempts"("paymentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_paymentId_idempotencyKey_key" ON "payment_attempts"("paymentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "inventory_reservations_orderId_idx" ON "inventory_reservations"("orderId");

-- CreateIndex
CREATE INDEX "inventory_reservations_status_expiresAt_idx" ON "inventory_reservations"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_attemptId_locationInventoryId_key" ON "inventory_reservations"("attemptId", "locationInventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_providerEventId_key" ON "payment_webhook_events"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "sandbox_payment_intents_attemptId_key" ON "sandbox_payment_intents"("attemptId");

-- CreateIndex
CREATE INDEX "payment_rate_limits_expiresAt_idx" ON "payment_rate_limits"("expiresAt");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_locationInventoryId_fkey" FOREIGN KEY ("locationInventoryId") REFERENCES "location_inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing orders are explicitly NOT online-paid; only new orders require payment.
ALTER TABLE "orders" ALTER COLUMN "paymentPolicy" SET DEFAULT 'ONLINE_REQUIRED';
ALTER TABLE "orders" ALTER COLUMN "fulfillmentEligible" SET DEFAULT false;
ALTER TABLE "organizations" ADD CONSTRAINT "organization_online_policy" CHECK ("paymentMode" = 'ONLINE_REQUIRED');
ALTER TABLE "location_inventory" ADD CONSTRAINT "reserved_within_physical_stock" CHECK ("quantityReserved" >= 0 AND "quantityReserved" <= "quantityOnHand");
ALTER TABLE "payments" ADD CONSTRAINT "positive_payment" CHECK ("amount" > 0 AND "currentAttemptNumber" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "success_timestamp" CHECK (("status" = 'SUCCEEDED') = ("succeededAt" IS NOT NULL));
ALTER TABLE "payments" ADD CONSTRAINT "review_reason_required" CHECK (NOT "reviewRequired" OR "reviewReason" IS NOT NULL);
ALTER TABLE "payment_attempts" ADD CONSTRAINT "attempt_number_positive" CHECK ("number" > 0);
CREATE UNIQUE INDEX "one_successful_attempt_per_payment" ON "payment_attempts" ("paymentId") WHERE "status" = 'SUCCEEDED';
CREATE UNIQUE INDEX "one_active_reservation_per_order_stock" ON "inventory_reservations" ("orderId", "locationInventoryId") WHERE "status" = 'ACTIVE';
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "reservation_state" CHECK ("quantity" > 0 AND (
 ("status" = 'ACTIVE' AND "releasedAt" IS NULL AND "consumedAt" IS NULL) OR
 ("status" = 'CONSUMED' AND "releasedAt" IS NULL AND "consumedAt" IS NOT NULL) OR
 ("status" IN ('RELEASED', 'EXPIRED') AND "releasedAt" IS NOT NULL AND "consumedAt" IS NULL)));
CREATE UNIQUE INDEX "one_order_consumption_per_stock" ON "inventory_movements" ("orderId", "locationInventoryId") WHERE "type" = 'ORDER_CONSUMPTION';
ALTER TABLE "orders" ADD CONSTRAINT "online_fulfillment_policy" CHECK ("paymentPolicy" <> 'ONLINE_REQUIRED' OR "status" = 'PLACED' OR "fulfillmentEligible");
CREATE FUNCTION enforce_order_payment_eligibility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."paymentPolicy" = 'ONLINE_REQUIRED' AND NEW."fulfillmentEligible" AND NOT EXISTS (
 SELECT 1 FROM payments p WHERE p."orderId" = NEW.id AND p.status = 'SUCCEEDED' AND NOT p."reviewRequired") THEN
 RAISE EXCEPTION 'Online fulfillment requires verified settlement';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_payment_eligibility BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION enforce_order_payment_eligibility();
