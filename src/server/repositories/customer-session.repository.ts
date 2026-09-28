import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";

const customerSessionInclude = {
  seat: { include: { hall: { include: { location: { include: { organization: true } } } } } },
  screening: { include: { movie: true, hall: true } },
} as const;

export async function createCustomerSessionRecord(input: {
  tokenHash: string;
  hallId: string;
  seatId: string;
  screeningId: string;
  expiresAt: Date;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
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
