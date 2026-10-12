-- CreateEnum
CREATE TYPE "StaffSetupState" AS ENUM ('INVITED', 'READY');

-- CreateEnum
CREATE TYPE "BrandAccent" AS ENUM ('AMBER', 'TEAL', 'VIOLET');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'STAFF_INVITED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_ROLE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_LOCATION_ACCESS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_SUSPENDED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_REACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_PROFILE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_SETUP_RESTARTED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_SETTINGS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_BRANDING_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'LOCATION_SETTINGS_UPDATED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'STAFF_ROLE_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'STAFF_ACCESS_CHANGED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "authorizationVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "identitySyncErrorCode" TEXT,
ADD COLUMN     "identitySyncLease" TEXT,
ADD COLUMN     "identitySyncLeaseUntil" TIMESTAMPTZ(3),
ADD COLUMN     "identitySyncPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "setupState" "StaffSetupState" NOT NULL DEFAULT 'READY';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "brandAccent" "BrandAccent" NOT NULL DEFAULT 'AMBER',
ADD COLUMN     "customerFacingName" VARCHAR(120),
ADD COLUMN     "logoStoragePath" TEXT,
ADD COLUMN     "settingsVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "supportEmail" VARCHAR(254),
ADD COLUMN     "supportPhone" VARCHAR(40),
ADD COLUMN     "website" VARCHAR(2048);

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "settingsVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "organization_memberships_organizationId_role_createdAt_idx" ON "organization_memberships"("organizationId", "role", "createdAt");

ALTER TABLE users ADD CONSTRAINT staff_authorization_version_nonnegative CHECK ("authorizationVersion">=0);
ALTER TABLE organization_memberships ADD CONSTRAINT staff_revision_nonnegative CHECK (revision>=0);
ALTER TABLE organizations ADD CONSTRAINT organization_settings_version_nonnegative CHECK ("settingsVersion">=0);
ALTER TABLE locations ADD CONSTRAINT location_settings_version_nonnegative CHECK ("settingsVersion">=0);
