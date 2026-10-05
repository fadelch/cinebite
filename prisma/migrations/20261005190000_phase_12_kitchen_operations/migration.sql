ALTER TYPE "OrderStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "OrderStatus" ADD VALUE 'PREPARING';
ALTER TYPE "OrderStatus" ADD VALUE 'READY';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_PREPARING_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_MARKED_READY';
CREATE TYPE "OrderStatusActorType" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');

CREATE TABLE "order_status_events" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fromStatus" "OrderStatus",
  "toStatus" "OrderStatus" NOT NULL,
  "actorType" "OrderStatusActorType" NOT NULL,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_status_events_actor_check" CHECK (
    ("actorType" = 'STAFF' AND "actorUserId" IS NOT NULL)
    OR ("actorType" IN ('CUSTOMER', 'SYSTEM') AND "actorUserId" IS NULL)
  ),
  CONSTRAINT "order_status_events_transition_check" CHECK (COALESCE((
    ("fromStatus" IS NULL AND "toStatus"::text = 'PLACED')
    OR ("fromStatus"::text = 'PLACED' AND "toStatus"::text = 'ACCEPTED')
    OR ("fromStatus"::text = 'ACCEPTED' AND "toStatus"::text = 'PREPARING')
    OR ("fromStatus"::text = 'PREPARING' AND "toStatus"::text = 'READY')
  ), false))
);
CREATE UNIQUE INDEX "order_status_events_orderId_toStatus_key" ON "order_status_events"("orderId", "toStatus");
CREATE INDEX "order_status_events_orderId_createdAt_idx" ON "order_status_events"("orderId", "createdAt");
CREATE INDEX "order_status_events_actorUserId_idx" ON "order_status_events"("actorUserId");
CREATE INDEX "orders_locationId_status_createdAt_idx" ON "orders"("locationId", "status", "createdAt");
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 11 stored timezone-less timestamps in UTC. Preserve the actual instant.
INSERT INTO "order_status_events" ("id", "orderId", "fromStatus", "toStatus", "actorType", "createdAt")
SELECT 'phase12-backfill-' || "id", "id", NULL, 'PLACED', 'SYSTEM', "createdAt" AT TIME ZONE 'UTC'
FROM "orders" ON CONFLICT ("orderId", "toStatus") DO NOTHING;

-- History is append-only even for accidental out-of-band ORM updates/deletes.
CREATE FUNCTION reject_order_status_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Order status history is append-only';
END;
$$;
CREATE TRIGGER order_status_events_immutable
BEFORE UPDATE OR DELETE ON "order_status_events"
FOR EACH ROW EXECUTE FUNCTION reject_order_status_event_mutation();
