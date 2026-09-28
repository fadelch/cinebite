import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ServiceError } from "@/server/services/service-error";

async function actorUserId(firebaseUid: string): Promise<string> {
  const actor = await prisma.user.findUnique({ where: { firebaseUid }, select: { id: true } });
  if (!actor) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  return actor.id;
}

export async function getSeatQrHallRecord(organizationId: string, locationId: string, hallId: string) {
  return prisma.hall.findFirst({
    where: { id: hallId, locationId, location: { organizationId } },
    include: {
      location: { include: { organization: { select: { id: true, name: true, status: true } } } },
      seats: { include: { qrCode: true } },
    },
  });
}

export async function getSeatQrTargetRecord(organizationId: string, locationId: string, hallId: string, seatId: string) {
  return prisma.seat.findFirst({
    where: { id: seatId, hallId, hall: { locationId, location: { organizationId } } },
    include: {
      qrCode: true,
      hall: { include: { location: { include: { organization: { select: { id: true, name: true, status: true } } } } } },
    },
  });
}

export async function findSeatQrByHashRecord(tokenHash: string) {
  return prisma.seatQrCode.findUnique({
    where: { tokenHash },
    include: {
      seat: { include: { hall: { include: { location: { include: { organization: true } } } } } },
    },
  });
}

export async function getSeatQrImageRecord(
  organizationId: string,
  locationId: string,
  hallId: string,
  seatId: string,
) {
  return prisma.seatQrCode.findFirst({
    where: { hallId, seatId, seat: { hall: { locationId, location: { organizationId } } } },
    select: { qrImageStoragePath: true, qrImageData: true },
  });
}

export async function createSeatQrRecord(input: {
  actorUid: string;
  organizationId: string;
  locationId: string;
  hallId: string;
  seatId: string;
  seatLabel: string;
  tokenHash: string;
  storagePath: string | null;
  imageData: Uint8Array<ArrayBuffer> | null;
}) {
  const actorId = await actorUserId(input.actorUid);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.seatQrCode.findUnique({ where: { hallId_seatId: { hallId: input.hallId, seatId: input.seatId } } });
    if (existing) throw new ServiceError("SEAT_QR_ALREADY_EXISTS", 409, "This seat already has a QR credential.");
    const created = await tx.seatQrCode.create({ data: {
      hallId: input.hallId,
      seatId: input.seatId,
      tokenHash: input.tokenHash,
      qrImageStoragePath: input.storagePath,
      qrImageData: input.imageData,
    } });
    await tx.auditLog.create({ data: {
      actorUserId: actorId,
      action: "SEAT_QR_GENERATED",
      entityType: "SEAT_QR_CODE",
      entityId: created.id,
      organizationId: input.organizationId,
      locationId: input.locationId,
      hallId: input.hallId,
      metadata: { seatLabel: input.seatLabel, version: created.version },
    } });
    return created;
  });
}

export async function replaceSeatQrRecord(input: {
  actorUid: string;
  organizationId: string;
  locationId: string;
  hallId: string;
  seatId: string;
  seatLabel: string;
  expectedVersion: number;
  tokenHash: string;
  storagePath: string | null;
  imageData: Uint8Array<ArrayBuffer> | null;
  action: "SEAT_QR_ROTATED" | "SEAT_QR_GENERATED";
}) {
  const actorId = await actorUserId(input.actorUid);
  return prisma.$transaction(async (tx) => {
    const result = await tx.seatQrCode.updateMany({
      where: { hallId: input.hallId, seatId: input.seatId, version: input.expectedVersion },
      data: {
        tokenHash: input.tokenHash,
        version: { increment: 1 },
        status: "ACTIVE",
        qrImageStoragePath: input.storagePath,
        qrImageData: input.imageData,
        rotatedAt: new Date(),
        revokedAt: null,
      },
    });
    if (result.count !== 1) throw new ServiceError("SEAT_QR_NOT_FOUND", 409, "The QR credential changed. Refresh and try again.");
    const updated = await tx.seatQrCode.findUniqueOrThrow({ where: { hallId_seatId: { hallId: input.hallId, seatId: input.seatId } } });
    await tx.auditLog.create({ data: {
      actorUserId: actorId,
      action: input.action,
      entityType: "SEAT_QR_CODE",
      entityId: updated.id,
      organizationId: input.organizationId,
      locationId: input.locationId,
      hallId: input.hallId,
      metadata: { seatLabel: input.seatLabel, previousVersion: input.expectedVersion, version: updated.version },
    } });
    return updated;
  });
}

export async function revokeSeatQrRecord(input: {
  actorUid: string;
  organizationId: string;
  locationId: string;
  hallId: string;
  seatId: string;
  seatLabel: string;
}) {
  const actorId = await actorUserId(input.actorUid);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.seatQrCode.findUnique({ where: { hallId_seatId: { hallId: input.hallId, seatId: input.seatId } } });
    if (!existing) throw new ServiceError("SEAT_QR_NOT_FOUND", 404, "Seat QR credential not found.");
    if (existing.status === "REVOKED") throw new ServiceError("NO_STATUS_CHANGE", 409, "This QR credential is already revoked.");
    const updated = await tx.seatQrCode.update({
      where: { id: existing.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await tx.auditLog.create({ data: {
      actorUserId: actorId,
      action: "SEAT_QR_REVOKED",
      entityType: "SEAT_QR_CODE",
      entityId: existing.id,
      organizationId: input.organizationId,
      locationId: input.locationId,
      hallId: input.hallId,
      metadata: { seatLabel: input.seatLabel, version: existing.version },
    } });
    return updated;
  });
}
