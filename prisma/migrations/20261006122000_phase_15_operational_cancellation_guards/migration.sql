-- Extend the existing Phase 12/13 constraints, preserving their actor/history rules.
ALTER TABLE order_status_events DROP CONSTRAINT order_status_events_transition_check;
ALTER TABLE order_status_events ADD CONSTRAINT order_status_events_transition_check CHECK (COALESCE((
  ("fromStatus" IS NULL AND "toStatus" = 'PLACED')
  OR ("fromStatus" = 'PLACED' AND "toStatus" = 'ACCEPTED')
  OR ("fromStatus" = 'ACCEPTED' AND "toStatus" = 'PREPARING')
  OR ("fromStatus" = 'PREPARING' AND "toStatus" = 'READY')
  OR ("fromStatus" = 'READY' AND "toStatus" = 'OUT_FOR_DELIVERY')
  OR ("fromStatus" = 'OUT_FOR_DELIVERY' AND "toStatus" = 'DELIVERED')
  OR ("fromStatus" IN ('PLACED','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY') AND "toStatus" = 'CANCELED')
), false));
ALTER TABLE orders DROP CONSTRAINT orders_delivery_assignment_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_assignment_check CHECK (
  (status IN ('PLACED','ACCEPTED','PREPARING','READY') AND "deliveryAssignedUserId" IS NULL AND "deliveryClaimedAt" IS NULL AND "deliveredAt" IS NULL)
  OR (status = 'OUT_FOR_DELIVERY' AND "deliveryAssignedUserId" IS NOT NULL AND "deliveryClaimedAt" IS NOT NULL AND "deliveredAt" IS NULL)
  OR (status = 'DELIVERED' AND "deliveryAssignedUserId" IS NOT NULL AND "deliveryClaimedAt" IS NOT NULL AND "deliveredAt" IS NOT NULL AND "deliveredAt" >= "deliveryClaimedAt")
  OR (status = 'CANCELED' AND "deliveredAt" IS NULL AND (("deliveryAssignedUserId" IS NULL AND "deliveryClaimedAt" IS NULL) OR ("deliveryAssignedUserId" IS NOT NULL AND "deliveryClaimedAt" IS NOT NULL)))
);
ALTER TABLE order_cancellations ADD CONSTRAINT eligible_cancellation_origin CHECK ("fromStatus" IN ('PLACED','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY'));
