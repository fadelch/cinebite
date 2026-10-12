import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { ServiceError } from '@/server/services/service-error';

const customerSessionInclude = {
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
  expiresAt: Date;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    // Serialize credential validation with rotation/revocation; close resolve->create race.
    await tx.$queryRaw`SELECT id FROM seat_qr_codes WHERE id=${input.qrId} FOR UPDATE`;
    const qr = await tx.seatQrCode.findFirst({ where: {
      id: input.qrId, tokenHash: input.qrHash, status: 'ACTIVE', hallId: input.hallId, seatId: input.seatId,
      seat: { status: 'ACTIVE', hallId: input.hallId, hall: { status: 'ACTIVE', location: { status: 'ACTIVE', organization: { status: 'ACTIVE' } } } },
    } });
    const screening = await tx.screening.findFirst({ where: {
      id: input.screeningId, hallId: input.hallId, status: 'SCHEDULED', startsAt: { lte: input.now }, endsAt: { gt: input.now },
    } });
    if (!qr || !screening) throw new ServiceError('CUSTOMER_SESSION_INVALID', 404, 'This seat access code is unavailable.');
    await tx.customerSession.updateMany({
      where: { hallId: input.hallId, seatId: input.seatId, screeningId: input.screeningId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: input.now },
    });
    return tx.customerSession.create({
      data: {
        id: randomUUID(),
        tokenHash: input.tokenHash,
        hallId: input.hallId,
        seatId: input.seatId,
        screeningId: input.screeningId,
        expiresAt: input.expiresAt,
      },
      include: customerSessionInclude,
    });
  }, { isolationLevel: "Serializable" });
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
