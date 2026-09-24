-- Phase 7: organization catalog, location pricing/availability, and product media metadata.
CREATE TYPE "MenuStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_IMAGE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_IMAGE_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_LOCATION_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_LOCATION_PRICE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_LOCATION_AVAILABILITY_CHANGED';

ALTER TYPE "AuditEntityType" ADD VALUE 'MENU_CATEGORY';
ALTER TYPE "AuditEntityType" ADD VALUE 'PRODUCT';
ALTER TYPE "AuditEntityType" ADD VALUE 'PRODUCT_LOCATION';

CREATE TABLE "menu_categories" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "status" "MenuStatus" NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menu_categories_sort_order_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "products" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "sku" TEXT,
  "imageStoragePath" TEXT,
  "imageUrl" TEXT,
  "status" "MenuStatus" NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_sort_order_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "product_locations" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_locations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_locations_price_check" CHECK ("price" >= 0 AND "price" <= 999999.99),
  CONSTRAINT "product_locations_currency_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$')
);

CREATE INDEX "menu_categories_organizationId_status_sortOrder_idx" ON "menu_categories"("organizationId", "status", "sortOrder");
CREATE UNIQUE INDEX "menu_categories_organizationId_slug_key" ON "menu_categories"("organizationId", "slug");
CREATE UNIQUE INDEX "menu_categories_id_organizationId_key" ON "menu_categories"("id", "organizationId");
CREATE INDEX "products_organizationId_status_updatedAt_idx" ON "products"("organizationId", "status", "updatedAt");
CREATE INDEX "products_categoryId_status_sortOrder_idx" ON "products"("categoryId", "status", "sortOrder");
CREATE UNIQUE INDEX "products_organizationId_slug_key" ON "products"("organizationId", "slug");
CREATE UNIQUE INDEX "products_organizationId_sku_key" ON "products"("organizationId", "sku");
CREATE UNIQUE INDEX "products_id_organizationId_key" ON "products"("id", "organizationId");
CREATE INDEX "product_locations_locationId_isAvailable_idx" ON "product_locations"("locationId", "isAvailable");
CREATE INDEX "product_locations_organizationId_idx" ON "product_locations"("organizationId");
CREATE UNIQUE INDEX "product_locations_productId_locationId_key" ON "product_locations"("productId", "locationId");

ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_organizationId_fkey" FOREIGN KEY ("categoryId", "organizationId") REFERENCES "menu_categories"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_productId_organizationId_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "products"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_locationId_organizationId_fkey" FOREIGN KEY ("locationId", "organizationId") REFERENCES "locations"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
