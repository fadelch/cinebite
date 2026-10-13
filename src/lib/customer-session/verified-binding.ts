export interface VerifiedSeatBinding {
  hallId: string; seatId: string; screeningId: string;
  qrId: string | null; qrVersion: number | null; checkInId: string | null;
  qrCode: { id: string; hallId: string; seatId: string; status: string; version: number } | null;
  checkIn: { id: string; qrId: string; qrVersion: number; screeningId: string; status: string; consumedAt: Date | null } | null;
}

export function hasVerifiedSeatBinding(session: VerifiedSeatBinding) {
  const { qrCode: qr, checkIn: grant } = session;
  return Boolean(qr && grant && session.qrId === qr.id && session.qrVersion === qr.version
    && qr.status === "ACTIVE" && qr.hallId === session.hallId && qr.seatId === session.seatId
    && session.checkInId === grant.id && grant.qrId === qr.id && grant.qrVersion === qr.version
    && grant.screeningId === session.screeningId && grant.status === "CONSUMED" && grant.consumedAt);
}
