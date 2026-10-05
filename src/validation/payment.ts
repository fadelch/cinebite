import { z } from "zod";
import { checkoutSchema } from "./order";
export const paymentRetrySchema = checkoutSchema.pick({ idempotencyKey: true }).strict();
export const sandboxOutcomeSchema = z.object({ outcome: z.enum(["PROCESSING", "SUCCEEDED", "FAILED", "CANCELED"]) }).strict();
