-- Enum additions committed by the preceding migration before these references.
ALTER TABLE orders DROP CONSTRAINT online_fulfillment_policy;
ALTER TABLE orders ADD CONSTRAINT online_fulfillment_policy CHECK (
  "paymentPolicy" <> 'ONLINE_REQUIRED' OR status IN ('PLACED', 'CANCELED') OR "fulfillmentEligible");
ALTER TABLE orders ADD CONSTRAINT canceled_not_fulfillable CHECK (status <> 'CANCELED' OR NOT "fulfillmentEligible");
CREATE FUNCTION enforce_order_terminal_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'CANCELED' AND NEW.status <> 'CANCELED' THEN RAISE EXCEPTION 'Canceled orders are terminal'; END IF;
  IF OLD.status = 'DELIVERED' AND NEW.status <> 'DELIVERED' THEN RAISE EXCEPTION 'Delivered history cannot be rewound'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_terminal_state BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION enforce_order_terminal_state();
CREATE UNIQUE INDEX one_cancellation_restock_per_stock ON inventory_movements ("orderId", "locationInventoryId") WHERE type = 'ORDER_CANCELLATION_RESTOCK';
ALTER TABLE inventory_movements ADD CONSTRAINT restock_positive CHECK (type <> 'ORDER_CANCELLATION_RESTOCK' OR ("quantityDelta" > 0 AND "orderId" IS NOT NULL));
ALTER TABLE refunds ADD CONSTRAINT positive_refund CHECK (amount > 0);
ALTER TABLE refunds ADD CONSTRAINT refund_timestamps CHECK (
 (status = 'SUCCEEDED') = ("succeededAt" IS NOT NULL) AND (status = 'FAILED') = ("failedAt" IS NOT NULL));
ALTER TABLE order_cancellations ADD CONSTRAINT cancellation_actor CHECK (("initiatedByType" = 'STAFF') = ("initiatedByUserId" IS NOT NULL));
ALTER TABLE refunds ADD CONSTRAINT refund_actor CHECK (("initiatedByType" = 'STAFF') = ("initiatedByUserId" IS NOT NULL));
ALTER TABLE order_issues ADD CONSTRAINT issue_resolution CHECK (
 (status = 'OPEN' AND "resolvedAt" IS NULL AND "resolvedByUserId" IS NULL AND resolution IS NULL) OR
 (status = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "resolvedByUserId" IS NOT NULL AND length(resolution) > 0));

-- Defense in depth: serialize financial exposure on the captured Payment row.
-- Application transactions lock Order then Payment and never perform provider I/O here.
CREATE FUNCTION enforce_refund_capture_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p payments; exposure numeric;
BEGIN
  SELECT * INTO p FROM payments WHERE id = NEW."paymentId" FOR UPDATE;
  IF p.id IS NULL OR p.status <> 'SUCCEEDED' OR p."orderId" <> NEW."orderId" OR p."currencyCode" <> NEW."currencyCode" OR p.provider <> NEW.provider THEN
    RAISE EXCEPTION 'Refund requires matching captured payment';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.amount <> NEW.amount OR OLD."paymentId" <> NEW."paymentId" OR OLD."orderId" <> NEW."orderId" OR OLD."currencyCode" <> NEW."currencyCode"
      OR OLD."idempotencyKey" <> NEW."idempotencyKey" OR OLD.provider <> NEW.provider THEN RAISE EXCEPTION 'Immutable refund financial identity'; END IF;
    IF OLD.status IN ('SUCCEEDED', 'FAILED', 'CANCELED') AND NEW.status <> OLD.status THEN RAISE EXCEPTION 'Terminal refund must be retried as a new record'; END IF;
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO exposure FROM refunds WHERE "paymentId" = NEW."paymentId" AND id <> NEW.id AND status IN ('PENDING', 'PROCESSING', 'SUCCEEDED');
  IF NEW.status IN ('PENDING', 'PROCESSING', 'SUCCEEDED') THEN exposure := exposure + NEW.amount; END IF;
  IF exposure > p.amount THEN RAISE EXCEPTION 'Refund exposure exceeds capture'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refund_capture_limit BEFORE INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION enforce_refund_capture_limit();

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only business history cannot be changed'; END $$;
CREATE TRIGGER immutable_order_cancellation BEFORE UPDATE OR DELETE ON order_cancellations FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER preserve_refund_history BEFORE DELETE ON refunds FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
