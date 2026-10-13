import "server-only";
import { getCurrentUser } from "@/server/auth/current-user";
import { requireSeatQrActor, assertSeatQrLocationAccess } from "./seat-qr-access";
import { documentIdSchema } from "@/validation/shared";
import { issueSeatCheckInSchema } from "@/validation/seat-qr";
import { issueSeatCheckInRecord } from "@/server/repositories/seat-check-in.repository";

export async function issueSeatCheckIn(locationInput: string, hallInput: string, seatInput: string, input: unknown) {
  const actor = requireSeatQrActor(await getCurrentUser());
  const locationId = documentIdSchema.parse(locationInput);
  assertSeatQrLocationAccess(actor, locationId);
  const hallId = documentIdSchema.parse(hallInput), seatId = documentIdSchema.parse(seatInput);
  const parsed = issueSeatCheckInSchema.parse(input);
  return issueSeatCheckInRecord({ actorUid: actor.uid, organizationId: actor.organizationId, locationId, hallId, seatId, ticketReference: parsed.ticketReference, replaceExistingSession: parsed.replaceExistingSession });
}
