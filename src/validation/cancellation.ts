import { z } from "zod";
export const reasons = ["CUSTOMER_REQUEST", "SCREENING_CANCELED", "ITEM_UNAVAILABLE", "OPERATIONAL_ISSUE", "DELIVERY_ISSUE", "DUPLICATE_ORDER", "OTHER"] as const;
const note = z.string().trim().max(300).optional();
export const cancelSchema = z.object({ reasonCode: z.enum(reasons), reasonNote: note,
  confirmed: z.literal(true), exceptional: z.boolean().default(false) }).strict();
export const customerCancelSchema = z.object({ confirmed: z.literal(true), reasonNote: note }).strict();
export const refundSchema = z.object({ kind: z.enum(["FULL", "PARTIAL"]), amount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/).optional(),
  reasonCode: z.enum(reasons), reasonNote: note, idempotencyKey: z.uuid(), confirmed: z.literal(true) }).strict();
export const refundRetrySchema = z.object({ refundId: z.string().min(1).max(150), idempotencyKey: z.uuid(), confirmed: z.literal(true) }).strict();
export const issueSchema = z.object({ type: z.enum(["CUSTOMER_UNAVAILABLE", "WRONG_SEAT_CONTEXT", "ORDER_DAMAGED", "ITEM_MISSING", "OTHER"]), note }).strict();
export const resolveIssueSchema = z.object({ issueId: z.string().min(1).max(150), resolution: z.string().trim().min(1).max(300), confirmed: z.literal(true) }).strict();
export const reconciliationSchema = z.object({ confirmed: z.literal(true), batchOrderIds: z.array(z.string().min(1).max(150)).max(100) }).strict()
  .refine(input => new Set(input.batchOrderIds).size === input.batchOrderIds.length, "Choose a unique reviewed batch.");
