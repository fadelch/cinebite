import { z } from "zod";

import { OPAQUE_TOKEN_LENGTH } from "@/lib/security/opaque-token";
import { documentIdSchema } from "@/validation/shared";

export const seatQrCredentialSchema = z.string().length(OPAQUE_TOKEN_LENGTH).regex(/^[A-Za-z0-9_-]+$/);
export const seatQrSeatSchema = z.strictObject({ seatId: documentIdSchema });
export const seatQrBulkSchema = z.strictObject({ action: z.literal("GENERATE_MISSING") });
export const seatAccessCodeSchema = z.string().trim().transform((value) => value.replace(/[ -]/g, "")).pipe(z.string().regex(/^\d{12}$/, "Enter the 12-digit code provided at ticket check-in."));
export const customerSessionStartSchema = z.strictObject({ credential: seatQrCredentialSchema, accessCode: seatAccessCodeSchema });
export const issueSeatCheckInSchema = z.strictObject({
  ticketVerified: z.literal(true),
  ticketReference: z.string().trim().min(1).max(100),
  replaceExistingSession: z.boolean().default(false),
});
export const customerSessionEndSchema = z.strictObject({ action: z.literal("END_SESSION") });
