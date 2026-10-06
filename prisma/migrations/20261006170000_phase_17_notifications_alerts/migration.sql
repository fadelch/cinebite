-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_ORDER', 'ORDER_ACCEPTED', 'ORDER_PREPARING', 'ORDER_READY', 'ORDER_OUT_FOR_DELIVERY', 'ORDER_DELIVERED', 'ORDER_CANCELED', 'PAYMENT_FAILED', 'REFUND_FAILED', 'REFUND_SUCCEEDED', 'LOW_STOCK', 'OUT_OF_STOCK', 'STOCK_RECOVERED', 'ORDER_ISSUE_REPORTED', 'SCREENING_CANCELED');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ORDERS', 'INVENTORY', 'FINANCIAL', 'EXCEPTIONS');

-- CreateEnum
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'NOTIFICATION_PREFERENCES_CHANGED';

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "lastErrorCode" TEXT,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "customerSessionId" TEXT,
    "type" "NotificationType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "message" VARCHAR(600) NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId","category")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_eventKey_key" ON "notification_outbox"("eventKey");

-- CreateIndex
CREATE INDEX "notification_outbox_status_nextAttemptAt_createdAt_idx" ON "notification_outbox"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "notification_outbox_organizationId_createdAt_idx" ON "notification_outbox"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_recipientUserId_readAt_createdAt_idx" ON "notifications"("recipientUserId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_customerSessionId_createdAt_idx" ON "notifications"("customerSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_organizationId_locationId_type_createdAt_idx" ON "notifications"("organizationId", "locationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_expiresAt_idx" ON "notifications"("expiresAt");

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "notification_outbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customerSessionId_fkey" FOREIGN KEY ("customerSessionId") REFERENCES "customer_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE notifications ADD CONSTRAINT notification_one_audience CHECK (("recipientUserId" IS NULL) <> ("customerSessionId" IS NULL));
ALTER TABLE notification_outbox ADD CONSTRAINT outbox_bounded_attempts CHECK ("attemptCount" BETWEEN 0 AND 5);

-- Transactional publication: these AFTER triggers run inside the actual business
-- transaction. No provider/network work happens in a trigger or business service.
-- Safe snapshots only, never session tokens, notes, provider errors or contacts.
CREATE FUNCTION cinebite_notification_emit(event_key text, kind "NotificationType", org text, loc text, entity_type text, entity_id text, safe_payload jsonb)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  INSERT INTO notification_outbox (id,"eventKey",type,"organizationId","locationId","entityType","entityId",payload)
  VALUES (gen_random_uuid()::text,event_key,kind,org,loc,entity_type,entity_id,safe_payload)
  ON CONFLICT ("eventKey") DO NOTHING;
$$;

CREATE FUNCTION cinebite_notification_order() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_eligible boolean := false;
BEGIN
  IF TG_OP='UPDATE' THEN old_eligible := OLD.status<>'CANCELED' AND (OLD."paymentPolicy"='LEGACY_NOT_REQUIRED' OR OLD."fulfillmentEligible"); END IF;
  IF NOT old_eligible AND NEW.status<>'CANCELED' AND (NEW."paymentPolicy"='LEGACY_NOT_REQUIRED' OR NEW."fulfillmentEligible") THEN
    PERFORM cinebite_notification_emit('eligible:'||NEW.id,'NEW_ORDER',NEW."organizationId",NEW."locationId",'ORDER',NEW.id,
      jsonb_build_object('code',NEW."publicOrderCode",'hall',NEW."hallNameSnapshot",'seat',NEW."seatLabelSnapshot"));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notification_order_eligible AFTER INSERT OR UPDATE OF "fulfillmentEligible",status ON orders FOR EACH ROW EXECUTE FUNCTION cinebite_notification_order();

CREATE FUNCTION cinebite_notification_status_event() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE o orders%ROWTYPE; kind "NotificationType";
BEGIN
  kind := CASE NEW."toStatus"::text WHEN 'ACCEPTED' THEN 'ORDER_ACCEPTED' WHEN 'PREPARING' THEN 'ORDER_PREPARING' WHEN 'READY' THEN 'ORDER_READY'
    WHEN 'OUT_FOR_DELIVERY' THEN 'ORDER_OUT_FOR_DELIVERY' WHEN 'DELIVERED' THEN 'ORDER_DELIVERED' WHEN 'CANCELED' THEN 'ORDER_CANCELED' ELSE NULL END;
  IF kind IS NOT NULL THEN
    SELECT * INTO o FROM orders WHERE id=NEW."orderId";
    PERFORM cinebite_notification_emit('status:'||NEW.id,kind,o."organizationId",o."locationId",'ORDER',o.id,jsonb_build_object('code',o."publicOrderCode",'hall',o."hallNameSnapshot",'seat',o."seatLabelSnapshot"));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notification_order_event AFTER INSERT ON order_status_events FOR EACH ROW EXECUTE FUNCTION cinebite_notification_status_event();

CREATE FUNCTION cinebite_notification_financial() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE o orders%ROWTYPE; kind "NotificationType"; event_key text;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='payments' THEN
    IF NEW.status<>'FAILED' THEN RETURN NEW; END IF;
    kind:='PAYMENT_FAILED'; event_key:='payment:'||NEW.id||':'||NEW."currentAttemptNumber";
  ELSE
    IF NEW.status NOT IN ('FAILED','SUCCEEDED') THEN RETURN NEW; END IF;
    kind:=CASE WHEN NEW.status='SUCCEEDED' THEN 'REFUND_SUCCEEDED'::"NotificationType" ELSE 'REFUND_FAILED'::"NotificationType" END;
    event_key:='refund:'||NEW.id||':'||NEW.status;
  END IF;
  SELECT * INTO o FROM orders WHERE id=NEW."orderId";
  PERFORM cinebite_notification_emit(event_key,kind,o."organizationId",o."locationId",'ORDER',o.id,
    jsonb_build_object('code',o."publicOrderCode",'amount',NEW.amount::text,'currency',o."currencyCode"));
  RETURN NEW;
END $$;
CREATE TRIGGER notification_payment_event AFTER INSERT OR UPDATE OF status ON payments FOR EACH ROW EXECUTE FUNCTION cinebite_notification_financial();
CREATE TRIGGER notification_refund_event AFTER INSERT OR UPDATE OF status ON refunds FOR EACH ROW EXECUTE FUNCTION cinebite_notification_financial();

CREATE FUNCTION cinebite_notification_stock() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE before_state text; after_state text; item_name text;
BEGIN
  before_state:=CASE WHEN OLD."quantityOnHand"-OLD."quantityReserved"<=0 THEN 'OUT_OF_STOCK' WHEN OLD."quantityOnHand"-OLD."quantityReserved"<=OLD."lowStockThreshold" THEN 'LOW_STOCK' ELSE 'IN_STOCK' END;
  after_state:=CASE WHEN NEW."quantityOnHand"-NEW."quantityReserved"<=0 THEN 'OUT_OF_STOCK' WHEN NEW."quantityOnHand"-NEW."quantityReserved"<=NEW."lowStockThreshold" THEN 'LOW_STOCK' ELSE 'IN_STOCK' END;
  IF before_state IS DISTINCT FROM after_state THEN
    SELECT name INTO item_name FROM inventory_items WHERE id=NEW."inventoryItemId";
    PERFORM cinebite_notification_emit('stock:'||NEW.id||':'||gen_random_uuid()::text,
      CASE WHEN after_state='IN_STOCK' THEN 'STOCK_RECOVERED'::"NotificationType" ELSE after_state::"NotificationType" END,
      NEW."organizationId",NEW."locationId",'INVENTORY',NEW.id,jsonb_build_object('item',item_name,'state',after_state));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notification_stock_transition AFTER UPDATE OF "quantityOnHand","quantityReserved","lowStockThreshold" ON location_inventory FOR EACH ROW EXECUTE FUNCTION cinebite_notification_stock();

CREATE FUNCTION cinebite_notification_issue() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE o orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM orders WHERE id=NEW."orderId";
  PERFORM cinebite_notification_emit('issue:'||NEW.id,'ORDER_ISSUE_REPORTED',o."organizationId",o."locationId",'ORDER',o.id,jsonb_build_object('code',o."publicOrderCode",'issueType',NEW.type::text));
  RETURN NEW;
END $$;
CREATE TRIGGER notification_issue_event AFTER INSERT ON order_issues FOR EACH ROW EXECUTE FUNCTION cinebite_notification_issue();

CREATE FUNCTION cinebite_notification_screening() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE org text; loc text;
BEGIN
  IF NEW.status='CANCELLED' AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS (SELECT 1 FROM orders WHERE "screeningId"=NEW.id) THEN
    SELECT l."organizationId",l.id INTO org,loc FROM halls h JOIN locations l ON l.id=h."locationId" WHERE h.id=NEW."hallId";
    PERFORM cinebite_notification_emit('screening:'||NEW.id,'SCREENING_CANCELED',org,loc,'SCREENING',NEW.id,'{}'::jsonb);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notification_screening_event AFTER UPDATE OF status ON screenings FOR EACH ROW EXECUTE FUNCTION cinebite_notification_screening();

-- Invocation is reserved to the database owner/application role, not anonymous SQL roles.
REVOKE ALL ON FUNCTION cinebite_notification_emit(text,"NotificationType",text,text,text,text,jsonb) FROM PUBLIC;
