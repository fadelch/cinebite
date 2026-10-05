ALTER TYPE "OrderStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_CLAIMED_FOR_DELIVERY';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_DELIVERED';

ALTER TABLE "orders"
  ADD COLUMN "readyAt" TIMESTAMPTZ(3),
  ADD COLUMN "deliveryAssignedUserId" TEXT,
  ADD COLUMN "deliveryClaimedAt" TIMESTAMPTZ(3),
  ADD COLUMN "deliveredAt" TIMESTAMPTZ(3);
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryAssignedUserId_fkey"
  FOREIGN KEY ("deliveryAssignedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cache the authoritative READY event instant for indexed oldest-ready-first queries.
-- Existing immutable events are not rewritten.
UPDATE "orders" o SET "readyAt" = e."createdAt"
FROM "order_status_events" e WHERE e."orderId" = o."id" AND e."toStatus"::text = 'READY';

ALTER TABLE "order_status_events" DROP CONSTRAINT "order_status_events_transition_check";
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_transition_check" CHECK (COALESCE((
  ("fromStatus" IS NULL AND "toStatus"::text = 'PLACED')
  OR ("fromStatus"::text = 'PLACED' AND "toStatus"::text = 'ACCEPTED')
  OR ("fromStatus"::text = 'ACCEPTED' AND "toStatus"::text = 'PREPARING')
  OR ("fromStatus"::text = 'PREPARING' AND "toStatus"::text = 'READY')
  OR ("fromStatus"::text = 'READY' AND "toStatus"::text = 'OUT_FOR_DELIVERY')
  OR ("fromStatus"::text = 'OUT_FOR_DELIVERY' AND "toStatus"::text = 'DELIVERED')
), false));
-- The Phase 12 append-only trigger, actor check and unique event index remain intact.
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_assignment_check" CHECK (
  ("status"::text IN ('PLACED','ACCEPTED','PREPARING','READY')
    AND "deliveryAssignedUserId" IS NULL AND "deliveryClaimedAt" IS NULL AND "deliveredAt" IS NULL)
  OR ("status"::text = 'OUT_FOR_DELIVERY' AND "deliveryAssignedUserId" IS NOT NULL
    AND "deliveryClaimedAt" IS NOT NULL AND "deliveredAt" IS NULL)
  OR ("status"::text = 'DELIVERED' AND "deliveryAssignedUserId" IS NOT NULL
    AND "deliveryClaimedAt" IS NOT NULL AND "deliveredAt" IS NOT NULL AND "deliveredAt" >= "deliveryClaimedAt")
);
CREATE INDEX "orders_locationId_status_readyAt_idx" ON "orders"("locationId","status","readyAt");
CREATE INDEX "orders_deliveryAssignedUserId_status_deliveryClaimedAt_idx" ON "orders"("deliveryAssignedUserId","status","deliveryClaimedAt");
CREATE INDEX "orders_locationId_status_deliveredAt_idx" ON "orders"("locationId","status","deliveredAt");
