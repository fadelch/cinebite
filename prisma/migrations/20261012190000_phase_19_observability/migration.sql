-- CreateEnum
CREATE TYPE "OperationalJobStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "OperationalIncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "jobType" VARCHAR(40) NOT NULL,
    "requestId" VARCHAR(40),
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "status" "OperationalJobStatus" NOT NULL DEFAULT 'RUNNING',
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "safeErrorCode" VARCHAR(60),
    "environment" VARCHAR(16) NOT NULL,
    "release" VARCHAR(80),

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_incidents" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "domain" VARCHAR(120) NOT NULL,
    "errorCode" VARCHAR(60) NOT NULL,
    "requestId" VARCHAR(40),
    "jobRunId" VARCHAR(40),
    "status" "OperationalIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "occurrences" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "operational_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_runs_jobType_startedAt_idx" ON "job_runs"("jobType", "startedAt");

-- CreateIndex
CREATE INDEX "job_runs_status_startedAt_idx" ON "job_runs"("status", "startedAt");

-- CreateIndex
CREATE INDEX "job_runs_startedAt_idx" ON "job_runs"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "operational_incidents_key_key" ON "operational_incidents"("key");

-- CreateIndex
CREATE INDEX "operational_incidents_status_lastSeenAt_idx" ON "operational_incidents"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "payment_webhook_events_receivedAt_idx" ON "payment_webhook_events"("receivedAt");

-- CreateIndex
CREATE INDEX "refunds_status_createdAt_idx" ON "refunds"("status", "createdAt");

-- CreateIndex
CREATE INDEX "notification_outbox_status_createdAt_idx" ON "notification_outbox"("status", "createdAt");
ALTER TABLE job_runs ADD CONSTRAINT job_run_counts_nonnegative CHECK ("processedCount" >= 0 AND "failedCount" >= 0 AND ("durationMs" IS NULL OR "durationMs" >= 0));
ALTER TABLE operational_incidents ADD CONSTRAINT incident_occurrences_positive CHECK (occurrences > 0);
