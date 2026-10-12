import { z } from "zod";

import { OPAQUE_TOKEN_LENGTH } from "@/lib/security/opaque-token";
import { documentIdSchema } from "@/validation/shared";

export const seatQrCredentialSchema = z.string().length(OPAQUE_TOKEN_LENGTH).regex(/^[A-Za-z0-9_-]+$/);
export const seatQrSeatSchema = z.strictObject({ seatId: documentIdSchema });
export const seatQrBulkSchema = z.strictObject({ action: z.literal("GENERATE_MISSING") });
export const customerSessionStartSchema = z.strictObject({ credential: seatQrCredentialSchema });
export const customerSessionEndSchema = z.strictObject({ action: z.literal("END_SESSION") });
