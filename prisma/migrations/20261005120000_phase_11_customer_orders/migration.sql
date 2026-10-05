-- Phase 11: server-authoritative carts and atomic customer orders.
CREATE TYPE "OrderStatus" AS ENUM ('PLACED');

ALTER TYPE "InventoryMovementType" ADD VALUE 'ORDER_CONSUMPTION';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_PLACED';
ALTER TYPE "AuditEntityType" ADD VALUE 'ORDER';

CREATE TABLE "carts" (
  "id" TEXT NOT NULL,
  "customerSessionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cart_items" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reviewedUnitPrice" DECIMAL(12,2) NOT NULL,
  "reviewedCurrencyCode" CHAR(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cart_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 20),
  CONSTRAINT "cart_items_price_check" CHECK ("reviewedUnitPrice" >= 0)
);

CREATE TABLE "orders" (
  "id" TEXT NOT NULL,
  "publicOrderCode" TEXT NOT NULL,
  "customerSessionId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "hallId" TEXT NOT NULL,
  "seatId" TEXT NOT NULL,
  "screeningId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
  "currencyCode" CHAR(3) NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "customerNote" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "locationNameSnapshot" TEXT NOT NULL,
  "hallNameSnapshot" TEXT NOT NULL,
  "seatLabelSnapshot" TEXT NOT NULL,
  "movieTitleSnapshot" TEXT NOT NULL,
  "screeningStartsAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_amount_check" CHECK ("subtotal" >= 0 AND "total" >= 0),
  CONSTRAINT "orders_phase_11_total_check" CHECK ("subtotal" = "total")
);

CREATE TABLE "order_items" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "productImageSnapshot" TEXT,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_items_amount_check" CHECK ("unitPrice" >= 0 AND "lineTotal" >= 0),
  CONSTRAINT "order_items_total_check" CHECK ("lineTotal" = "unitPrice" * "quantity")
);

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_actorUserId_fkey";
ALTER TABLE "inventory_movements" ALTER COLUMN "actorUserId" DROP NOT NULL;
ALTER TABLE "inventory_movements" ADD COLUMN "orderId" TEXT;
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_sign_check";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sign_check" CHECK (
  ("type" IN ('RECEIVE', 'ADJUSTMENT_IN') AND "quantityDelta" > 0)
  OR ("type" IN ('ADJUSTMENT_OUT', 'WASTE', 'ORDER_CONSUMPTION') AND "quantityDelta" < 0)
);

CREATE UNIQUE INDEX "carts_customerSessionId_key" ON "carts"("customerSessionId");
CREATE UNIQUE INDEX "cart_items_cartId_productId_key" ON "cart_items"("cartId", "productId");
CREATE INDEX "cart_items_productId_idx" ON "cart_items"("productId");
CREATE UNIQUE INDEX "orders_publicOrderCode_key" ON "orders"("publicOrderCode");
CREATE UNIQUE INDEX "orders_customerSessionId_idempotencyKey_key" ON "orders"("customerSessionId", "idempotencyKey");
CREATE INDEX "orders_organizationId_createdAt_idx" ON "orders"("organizationId", "createdAt");
CREATE INDEX "orders_locationId_createdAt_idx" ON "orders"("locationId", "createdAt");
CREATE INDEX "orders_screeningId_createdAt_idx" ON "orders"("screeningId", "createdAt");
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");
CREATE INDEX "inventory_movements_orderId_idx" ON "inventory_movements"("orderId");

ALTER TABLE "carts" ADD CONSTRAINT "carts_customerSessionId_fkey" FOREIGN KEY ("customerSessionId") REFERENCES "customer_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerSessionId_fkey" FOREIGN KEY ("customerSessionId") REFERENCES "customer_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_locationId_organizationId_fkey" FOREIGN KEY ("locationId", "organizationId") REFERENCES "locations"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "halls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_hallId_seatId_fkey" FOREIGN KEY ("hallId", "seatId") REFERENCES "seats"("hallId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "screenings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
