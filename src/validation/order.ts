import { z } from "zod";

import { slugSchema } from "@/validation/shared";

export const cartItemUpdateSchema = z.object({
  productSlug: slugSchema,
  quantity: z.number().int().min(0).max(20),
}).strict();

export const checkoutSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/, "Invalid checkout key."),
  customerNote: z.string().trim().max(300).nullable().optional(),
}).strict();

export const orderCodeSchema = z.string().trim().regex(/^CB-[A-Z0-9]{10}$/, "Invalid order code.");
