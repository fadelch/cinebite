import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { CHECK_IN_LIFETIME_MS, checkInHash, createSeatAccessCode } from "@/lib/security/seat-check-in";
import { assertMutationActor } from "@/server/auth/mutation-scope";
import { ServiceError } from "@/server/services/service-error";

export async function issueSeatCheckInRecord(input: {
  actorUid: string; organizationId: string; locationId: string; hallId: string; seatId: string;
  ticketReference: string; replaceExistingSession: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    await assertMutationActor(tx, input.actorUid, input.organizationId, input.locationId);
    await tx.$queryRaw`SELECT id FROM seat_qr_codes WHERE "hallId"=${input.hallId} AND "seatId"=${input.seatId} FOR UPDATE`;
    const qr = await tx.seatQrCode.findFirst({ where: {
      hallId: input.hallId, seatId: input.seatId, status: "ACTIVE",
      seat: { status: "ACTIVE", hall: { status: "ACTIVE", locationId: input.locationId, location: { organizationId: input.organizationId, status: "ACTIVE", organization: { status: "ACTIVE" } } } },
    } });
    if (!qr) throw new ServiceError("SEAT_QR_NOT_FOUND", 404, "An active seat QR is required for ticket check-in.");
    const now = new Date();
    const screenings = await tx.screening.findMany({ where: { hallId: input.hallId, status: "SCHEDULED", startsAt: { lte: now }, endsAt: { gt: now } }, take: 2 });
    if (screenings.length !== 1) throw new ServiceError("NO_ACTIVE_SCREENING", 409, "Exactly one live screening is required for check-in.");
    const screening = screenings[0];
    await tx.$queryRaw`SELECT id FROM screenings WHERE id=${screening.id} FOR SHARE`;
    const current = await tx.screening.findUniqueOrThrow({ where: { id: screening.id } });
    const lockedNow = new Date();
    if (current.status !== "SCHEDULED" || current.startsAt > lockedNow || current.endsAt <= lockedNow || current.hallId !== input.hallId) throw new ServiceError("NO_ACTIVE_SCREENING", 409, "This screening is not accepting check-ins.");
    const existing = await tx.customerSession.findFirst({ where: { hallId: input.hallId, seatId: input.seatId, screeningId: screening.id, status: "ACTIVE", expiresAt: { gt: lockedNow } } });
    if (existing && !input.replaceExistingSession) throw new ServiceError("SEAT_ALREADY_CHECKED_IN", 409, "This seat already has a session. Verify the ticket again and explicitly authorize replacement.");
    await tx.seatCheckIn.updateMany({ where: { qrId: qr.id, screeningId: screening.id, status: "ISSUED" }, data: { status: "REVOKED" } });
    const id = randomUUID(), accessCode = createSeatAccessCode();
    const expiresAt = new Date(Math.min(current.endsAt.getTime(), lockedNow.getTime() + CHECK_IN_LIFETIME_MS));
    await tx.seatCheckIn.create({ data: {
      id, qrId: qr.id, qrVersion: qr.version, screeningId: screening.id,
      codeHash: checkInHash(`${id}:${qr.id}:${screening.id}:${qr.version}`, accessCode),
      ticketReferenceHash: checkInHash(`ticket:${screening.id}:${qr.id}`, input.ticketReference),
      issuedByUid: input.actorUid, replaceSessionId: existing?.id ?? null, expiresAt,
    } });
    const actor = await tx.user.findUniqueOrThrow({ where: { firebaseUid: input.actorUid }, select: { id: true } });
    await tx.auditLog.create({ data: { actorUserId: actor.id, action: "SEAT_CHECK_IN_ISSUED", entityType: "SEAT_CHECK_IN", entityId: id,
      organizationId: input.organizationId, locationId: input.locationId, hallId: input.hallId,
      metadata: { screeningId: screening.id, seatId: input.seatId, replacementAuthorized: Boolean(existing), expiresAt: expiresAt.toISOString() },
    } });
    // Returned once to authorized staff, never stored in plaintext or audit data.
    return { accessCode, expiresAt: expiresAt.toISOString(), screeningId: screening.id };
  });
}
