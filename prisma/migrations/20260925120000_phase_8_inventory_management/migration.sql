-- Phase 8: canonical inventory items, per-location stock, immutable movements, and product recipes.
CREATE TYPE "InventoryItemStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "InventoryUnit" AS ENUM ('EACH', 'GRAM', 'MILLILITER');
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIVE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'WASTE');

ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ITEM_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ITEM_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ITEM_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ITEM_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'LOCATION_INVENTORY_CONFIGURED';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_STOCK_RECEIVED';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ADJUSTMENT_IN';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ADJUSTMENT_OUT';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_WASTE_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_THRESHOLD_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_RECIPE_COMPONENT_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_RECIPE_COMPONENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_RECIPE_COMPONENT_REMOVED';

ALTER TYPE "AuditEntityType" ADD VALUE 'INVENTORY_ITEM';
ALTER TYPE "AuditEntityType" ADD VALUE 'LOCATION_INVENTORY';
ALTER TYPE "AuditEntityType" ADD VALUE 'INVENTORY_MOVEMENT';
ALTER TYPE "AuditEntityType" ADD VALUE 'PRODUCT_RECIPE_COMPONENT';

CREATE TABLE "inventory_items" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "unit" "InventoryUnit" NOT NULL,
  "status" "InventoryItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_inventory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantityOnHand" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "lowStockThreshold" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "location_inventory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "location_inventory_quantity_check" CHECK ("quantityOnHand" >= 0),
  CONSTRAINT "location_inventory_threshold_check" CHECK ("lowStockThreshold" >= 0)
);

CREATE TABLE "inventory_movements" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationInventoryId" TEXT NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "quantityDelta" DECIMAL(14,3) NOT NULL,
  "reason" TEXT,
  "note" TEXT,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movements_nonzero_check" CHECK ("quantityDelta" <> 0),
  CONSTRAINT "inventory_movements_sign_check" CHECK (
    ("type" IN ('RECEIVE', 'ADJUSTMENT_IN') AND "quantityDelta" > 0)
    OR ("type" IN ('ADJUSTMENT_OUT', 'WASTE') AND "quantityDelta" < 0)
  )
);

CREATE TABLE "product_recipe_components" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantityRequired" DECIMAL(14,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_recipe_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_recipe_quantity_check" CHECK ("quantityRequired" > 0)
);

CREATE UNIQUE INDEX "inventory_items_organizationId_sku_key" ON "inventory_items"("organizationId", "sku");
CREATE UNIQUE INDEX "inventory_items_id_organizationId_key" ON "inventory_items"("id", "organizationId");
CREATE INDEX "inventory_items_organizationId_status_name_idx" ON "inventory_items"("organizationId", "status", "name");

CREATE UNIQUE INDEX "location_inventory_locationId_inventoryItemId_key" ON "location_inventory"("locationId", "inventoryItemId");
CREATE UNIQUE INDEX "location_inventory_id_organizationId_key" ON "location_inventory"("id", "organizationId");
CREATE INDEX "location_inventory_organizationId_locationId_idx" ON "location_inventory"("organizationId", "locationId");
CREATE INDEX "location_inventory_inventoryItemId_idx" ON "location_inventory"("inventoryItemId");

CREATE INDEX "inventory_movements_organizationId_createdAt_idx" ON "inventory_movements"("organizationId", "createdAt");
CREATE INDEX "inventory_movements_locationInventoryId_createdAt_idx" ON "inventory_movements"("locationInventoryId", "createdAt");
CREATE INDEX "inventory_movements_actorUserId_idx" ON "inventory_movements"("actorUserId");

CREATE UNIQUE INDEX "product_recipe_components_productId_inventoryItemId_key" ON "product_recipe_components"("productId", "inventoryItemId");
CREATE INDEX "product_recipe_components_organizationId_productId_idx" ON "product_recipe_components"("organizationId", "productId");
CREATE INDEX "product_recipe_components_inventoryItemId_idx" ON "product_recipe_components"("inventoryItemId");

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_inventory" ADD CONSTRAINT "location_inventory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_inventory" ADD CONSTRAINT "location_inventory_locationId_organizationId_fkey" FOREIGN KEY ("locationId", "organizationId") REFERENCES "locations"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_inventory" ADD CONSTRAINT "location_inventory_inventoryItemId_organizationId_fkey" FOREIGN KEY ("inventoryItemId", "organizationId") REFERENCES "inventory_items"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_locationInventoryId_organizationId_fkey" FOREIGN KEY ("locationInventoryId", "organizationId") REFERENCES "location_inventory"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_recipe_components" ADD CONSTRAINT "product_recipe_components_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_recipe_components" ADD CONSTRAINT "product_recipe_components_productId_organizationId_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "products"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_recipe_components" ADD CONSTRAINT "product_recipe_components_inventoryItemId_organizationId_fkey" FOREIGN KEY ("inventoryItemId", "organizationId") REFERENCES "inventory_items"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
