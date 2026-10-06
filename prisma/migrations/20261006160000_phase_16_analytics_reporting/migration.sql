-- Reporting uses existing transactional source records, not duplicated rollups.
ALTER TYPE "AuditAction" ADD VALUE 'REPORT_EXPORTED';
ALTER TYPE "AuditEntityType" ADD VALUE 'ANALYTICS';
CREATE INDEX "payments_status_succeededAt_idx" ON "payments"("status", "succeededAt");
CREATE INDEX "refunds_status_succeededAt_idx" ON "refunds"("status", "succeededAt");
CREATE TABLE "report_export_limits" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL CHECK ("count" > 0),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "report_export_limits_expiresAt_idx" ON "report_export_limits"("expiresAt");
