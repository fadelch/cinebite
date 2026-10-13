import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { ServiceError } from '@/server/services/service-error';
import { CHECK_IN_MAX_ATTEMPTS, checkInHash, validCheckInHash } from "@/lib/security/seat-check-in";

const customerSessionInclude = {
  qrCode: true,
  checkIn: true,
  seat: { include: { hall: { include: { location: { include: { organization: true } } } } } },
  screening: { include: { movie: true, hall: true } },
} as const;

export async function createCustomerSessionRecord(input: {
  qrId: string;
  qrHash: string;
  tokenHash: string;
  hallId: string;
  seatId: string;
  screeningId: string;
  accessCode: string;
  expiresAt: Date;
  now: Date;
}) {
  const result = await prisma.$transaction(async (tx) => {
    // Serialize credential validation with rotation/revocation; close resolve->create race.
    await tx.$queryRaw`SELECT id FROM seat_qr_codes WHERE id=${input.qrId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM screenings WHERE id=${input.screeningId} FOR SHARE`;
    // Use time after lock acquisition; queueing must not extend a code's lifetime.
    const now = new Date(Math.max(input.now.getTime(), Date.now()));
    const qr = await tx.seatQrCode.findFirst({ where: {
      id: input.qrId, tokenHash: input.qrHash, status: 'ACTIVE', hallId: input.hallId, seatId: input.seatId,
      seat: { status: 'ACTIVE', hallId: input.hallId, hall: { status: 'ACTIVE', location: { status: 'ACTIVE', organization: { status: 'ACTIVE' } } } },
    } });
    const screening = await tx.screening.findFirst({ where: {
      id: input.screeningId, hallId: input.hallId, status: 'SCHEDULED', startsAt: { lte: now }, endsAt: { gt: now },
    } });
    if (!qr || !screening) throw new ServiceError('CUSTOMER_SESSION_INVALID', 404, 'This seat access code is unavailable.');
    const grant = await tx.seatCheckIn.findFirst({ where: { qrId: qr.id, qrVersion: qr.version, screeningId: screening.id, status: "ISSUED" } });
    if (!grant || grant.expiresAt <= now || grant.failedAttempts >= CHECK_IN_MAX_ATTEMPTS) return { denied: true as const };
    const supplied = checkInHash(`${grant.id}:${qr.id}:${screening.id}:${qr.version}`, input.accessCode);
    if (!validCheckInHash(grant.codeHash, supplied)) {
      const failedAttempts = grant.failedAttempts + 1;
      await tx.seatCheckIn.update({ where: { id: grant.id }, data: { failedAttempts, status: failedAttempts >= CHECK_IN_MAX_ATTEMPTS ? "LOCKED" : "ISSUED" } });
      // Return rather than throw so failed attempt accounting commits.
      return { denied: true as const };
    }
    const existing = await tx.customerSession.findFirst({ where: { hallId: input.hallId, seatId: input.seatId, screeningId: input.screeningId, status: "ACTIVE", expiresAt: { gt: now } } });
    if (existing && existing.id !== grant.replaceSessionId) return { denied: true as const };
    await tx.seatCheckIn.update({ where: { id: grant.id }, data: { status: "CONSUMED", consumedAt: now } });
    await tx.customerSession.updateMany({
      where: { hallId: input.hallId, seatId: input.seatId, screeningId: input.screeningId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    });
    return tx.customerSession.create({
      data: {
        id: randomUUID(),
        tokenHash: input.tokenHash,
        hallId: input.hallId,
        seatId: input.seatId,
        screeningId: input.screeningId,
        qrId: qr.id,
        qrVersion: qr.version,
        checkInId: grant.id,
        expiresAt: input.expiresAt,
      },
      include: customerSessionInclude,
    });
  });
  if ("denied" in result) throw new ServiceError("SEAT_CHECK_IN_INVALID", 403, "The check-in code is incorrect, expired or already used. Ask the cinema team for help.");
  return result;
}

export async function getCustomerSessionByHashRecord(tokenHash: string) {
  return prisma.customerSession.findUnique({ where: { tokenHash }, include: customerSessionInclude });
}

export async function touchCustomerSessionRecord(id: string, now: Date) {
  await prisma.customerSession.update({ where: { id }, data: { lastSeenAt: now } });
}

export async function revokeCustomerSessionByHashRecord(tokenHash: string, now: Date) {
  return prisma.customerSession.updateMany({
    where: { tokenHash, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: now },
  });
}
