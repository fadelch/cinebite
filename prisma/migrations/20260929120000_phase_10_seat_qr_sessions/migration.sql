-- CreateEnum
CREATE TYPE "SeatQrStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "CustomerSessionStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SEAT_QR_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'SEAT_QR_ROTATED';
ALTER TYPE "AuditAction" ADD VALUE 'SEAT_QR_REVOKED';

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE 'SEAT_QR_CODE';

-- CreateTable
CREATE TABLE "seat_qr_codes" (
    "id" TEXT NOT NULL,
    "hallId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SeatQrStatus" NOT NULL DEFAULT 'ACTIVE',
    "qrImageStoragePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "seat_qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "hallId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "screeningId" TEXT NOT NULL,
    "status" "CustomerSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seat_qr_codes_tokenHash_key" ON "seat_qr_codes"("tokenHash");
CREATE UNIQUE INDEX "seat_qr_codes_hallId_seatId_key" ON "seat_qr_codes"("hallId", "seatId");
CREATE INDEX "seat_qr_codes_status_updatedAt_idx" ON "seat_qr_codes"("status", "updatedAt");
CREATE UNIQUE INDEX "customer_sessions_tokenHash_key" ON "customer_sessions"("tokenHash");
CREATE INDEX "customer_sessions_tokenHash_status_idx" ON "customer_sessions"("tokenHash", "status");
CREATE INDEX "customer_sessions_hallId_seatId_screeningId_status_idx" ON "customer_sessions"("hallId", "seatId", "screeningId", "status");
CREATE INDEX "customer_sessions_expiresAt_idx" ON "customer_sessions"("expiresAt");

-- One current session per physical seat and screening. A rescan revokes it before replacement.
CREATE UNIQUE INDEX "customer_sessions_one_active_per_seat_screening"
ON "customer_sessions"("hallId", "seatId", "screeningId")
WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "seat_qr_codes" ADD CONSTRAINT "seat_qr_codes_hallId_seatId_fkey"
FOREIGN KEY ("hallId", "seatId") REFERENCES "seats"("hallId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_hallId_seatId_fkey"
FOREIGN KEY ("hallId", "seatId") REFERENCES "seats"("hallId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_screeningId_fkey"
FOREIGN KEY ("screeningId") REFERENCES "screenings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
