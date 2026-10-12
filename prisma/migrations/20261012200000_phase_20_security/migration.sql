CREATE TABLE "security_rate_limits" (
  "key" VARCHAR(64) NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "security_rate_limits_count_check" CHECK ("count" >= 1 AND "count" <= 1000000)
);
CREATE INDEX "security_rate_limits_expiresAt_idx" ON "security_rate_limits"("expiresAt");
