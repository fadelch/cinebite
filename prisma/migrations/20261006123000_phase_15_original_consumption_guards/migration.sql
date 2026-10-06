ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_sign_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_sign_check CHECK (
  (type IN ('RECEIVE','ADJUSTMENT_IN','ORDER_CANCELLATION_RESTOCK') AND "quantityDelta" > 0)
  OR (type IN ('ADJUSTMENT_OUT','WASTE','ORDER_CONSUMPTION') AND "quantityDelta" < 0)
);
CREATE FUNCTION enforce_original_cancellation_restock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE consumed numeric; origin orders;
BEGIN
  IF NEW.type = 'ORDER_CANCELLATION_RESTOCK' THEN
    SELECT * INTO origin FROM orders WHERE id = NEW."orderId";
    SELECT -"quantityDelta" INTO consumed FROM inventory_movements WHERE "orderId" = NEW."orderId" AND "locationInventoryId" = NEW."locationInventoryId" AND type = 'ORDER_CONSUMPTION';
    IF consumed IS NULL OR consumed <> NEW."quantityDelta" OR origin.status <> 'PLACED' OR origin."organizationId" <> NEW."organizationId" THEN
      RAISE EXCEPTION 'Restock requires exact original consumption before acceptance';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER original_cancellation_restock BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION enforce_original_cancellation_restock();
CREATE FUNCTION protect_order_inventory_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.type IN ('ORDER_CONSUMPTION','ORDER_CANCELLATION_RESTOCK') THEN RAISE EXCEPTION 'Order stock history is append-only'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER immutable_order_inventory_history BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION protect_order_inventory_history();
