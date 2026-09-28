import "server-only";

import { customerSessionExpiry } from "@/lib/customer-session/policy";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/security/opaque-token";
import {
  createCustomerSessionRecord,
  getCustomerSessionByHashRecord,
  revokeCustomerSessionByHashRecord,
  touchCustomerSessionRecord,
} from "@/server/repositories/customer-session.repository";
import { resolveSeatCredential } from "@/server/services/seat-scan.service";
import { ServiceError } from "@/server/services/service-error";
import { customerSessionStartSchema } from "@/validation/seat-qr";

export async function startCustomerSession(input: unknown, now = new Date()) {
  const { credential } = customerSessionStartSchema.parse(input);
  const resolution = await resolveSeatCredential(credential, now);
  if (!resolution) throw new ServiceError("CUSTOMER_SESSION_INVALID", 404, "This seat access code is unavailable.");
  if (resolution.active.state !== "ACTIVE_SCREENING") {
    throw new ServiceError("NO_ACTIVE_SCREENING", 409, "No screening is currently active for this seat.");
  }
  const rawToken = createOpaqueToken();
  const expiresAt = customerSessionExpiry(new Date(resolution.active.screening.endsAt), now);
  await createCustomerSessionRecord({
    tokenHash: hashOpaqueToken(rawToken),
    hallId: resolution.active.hall.id,
    seatId: resolution.active.seat.id,
    screeningId: resolution.active.screening.id,
    expiresAt,
    now,
  });
  return { rawToken, expiresAt };
}

export async function validateCustomerSession(rawToken: string | undefined, now = new Date()) {
  if (!rawToken) throw new ServiceError("CUSTOMER_SESSION_INVALID", 401, "Your seat session is unavailable.");
  const session = await getCustomerSessionByHashRecord(hashOpaqueToken(rawToken));
  if (!session || session.status !== "ACTIVE") {
    throw new ServiceError("CUSTOMER_SESSION_INVALID", 401, "Your seat session is unavailable.");
  }
  const operational = session.seat.status === "ACTIVE"
    && session.seat.hall.status === "ACTIVE"
    && session.seat.hall.location.status === "ACTIVE"
    && session.seat.hall.location.organization.status === "ACTIVE";
  const screeningValid = session.screening.status === "SCHEDULED"
    && session.screening.hallId === session.hallId
    && now >= session.screening.startsAt
    && now < session.screening.endsAt;
  if (!operational || !screeningValid || now >= session.expiresAt) {
    await revokeCustomerSessionByHashRecord(session.tokenHash, now).catch(() => undefined);
    throw new ServiceError("CUSTOMER_SESSION_EXPIRED", 401, "This seat session has ended. Scan the seat QR again during a live screening.");
  }
  if (!session.lastSeenAt || now.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await touchCustomerSessionRecord(session.id, now).catch(() => undefined);
  }
  return session;
}

export async function endCustomerSession(rawToken: string | undefined, now = new Date()) {
  if (rawToken) await revokeCustomerSessionByHashRecord(hashOpaqueToken(rawToken), now);
}
