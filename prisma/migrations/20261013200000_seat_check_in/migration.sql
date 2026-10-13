ALTER TYPE "AuditAction" ADD VALUE 'SEAT_CHECK_IN_ISSUED';
ALTER TYPE "AuditEntityType" ADD VALUE 'SEAT_CHECK_IN';
CREATE TABLE "seat_check_ins" (
  "id" TEXT NOT NULL,
  "qrId" TEXT NOT NULL,
  "qrVersion" INTEGER NOT NULL,
  "screeningId" TEXT NOT NULL,
  "codeHash" CHAR(64) NOT NULL,
  "ticketReferenceHash" CHAR(64) NOT NULL,
  "issuedByUid" TEXT NOT NULL,
  "replaceSessionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ISSUED',
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" TIMESTAMPTZ(3),
  CONSTRAINT "seat_check_ins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seat_check_ins_status_check" CHECK ("status" IN ('ISSUED', 'CONSUMED', 'LOCKED', 'REVOKED')),
  CONSTRAINT "seat_check_ins_attempts_check" CHECK ("failedAttempts" BETWEEN 0 AND 5),
  CONSTRAINT "seat_check_ins_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "seat_qr_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "seat_check_ins_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "screenings"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "seat_check_ins_qrId_screeningId_status_idx" ON "seat_check_ins"("qrId", "screeningId", "status");
CREATE UNIQUE INDEX "seat_check_ins_one_issued" ON "seat_check_ins"("qrId", "screeningId") WHERE "status" = 'ISSUED';

ALTER TABLE "customer_sessions" ADD COLUMN "qrId" TEXT,
  ADD COLUMN "qrVersion" INTEGER, ADD COLUMN "checkInId" TEXT;
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "seat_qr_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "seat_check_ins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "customer_sessions_checkInId_key" ON "customer_sessions"("checkInId");
CREATE INDEX "customer_sessions_qrId_status_idx" ON "customer_sessions"("qrId", "status");
-- Legacy QR-only sessions have no evidence of ticket check-in. Reauthorize them;
-- retain every session, cart, order, payment, refund and inventory history row.
UPDATE "customer_sessions" SET "status" = 'REVOKED', "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "customer_sessions_one_active_seat_screening" ON "customer_sessions"("hallId", "seatId", "screeningId") WHERE "status" = 'ACTIVE';
