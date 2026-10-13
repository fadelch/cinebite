import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { hasVerifiedSeatBinding } from "@/lib/customer-session/verified-binding";
import { ServiceError } from "@/server/services/service-error";

// Customer writes lock QR before session, matching issue/redeem/revoke ordering.
// A write either finishes before revocation or observes it; it cannot start
// after revocation commits using a stale service-layer validation result.
export async function assertCustomerSessionAuthorization(tx: Prisma.TransactionClient, id: string, requestedNow = new Date()) {
  await tx.$queryRaw`SELECT qr.id FROM seat_qr_codes qr JOIN customer_sessions cs ON cs."qrId"=qr.id WHERE cs.id=${id} FOR SHARE OF qr`;
  await tx.$queryRaw`SELECT id FROM customer_sessions WHERE id=${id} FOR SHARE`;
  const now = new Date(Math.max(requestedNow.getTime(), Date.now()));
  const session = await tx.customerSession.findUnique({ where: { id }, include: {
    qrCode: true, checkIn: true, screening: true,
    seat: { include: { hall: { include: { location: { include: { organization: true } } } } } },
  } });
  if (!session || session.status !== "ACTIVE" || session.expiresAt <= now || !hasVerifiedSeatBinding(session)
    || session.screening.status !== "SCHEDULED" || session.screening.hallId !== session.hallId
    || session.screening.startsAt > now || session.screening.endsAt <= now
    || session.seat.status !== "ACTIVE" || session.seat.hall.status !== "ACTIVE"
    || session.seat.hall.location.status !== "ACTIVE" || session.seat.hall.location.organization.status !== "ACTIVE") {
    throw new ServiceError("CUSTOMER_SESSION_EXPIRED", 401, "This seat session has ended. Ask the cinema team to check you in again.");
  }
}
