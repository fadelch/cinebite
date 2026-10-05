import { z } from "zod";

import { ORDER_STATUSES } from "@/lib/orders/status";
import { isValidOrderTransition } from "@/lib/orders/status";

export const orderTransitionSchema = z.object({
  expectedStatus: z.enum(ORDER_STATUSES),
  toStatus: z.enum(ORDER_STATUSES),
}).strict().refine((input) => isValidOrderTransition(input.expectedStatus, input.toStatus), {
  message: "Only the next kitchen step is allowed.", path: ["toStatus"],
});

export const orderQueueQuerySchema = z.object({
  locationId: z.string().trim().min(1).max(128).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hall: z.string().trim().max(100).optional(),
  code: z.string().trim().max(32).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).strict();

export type OrderQueueQuery = z.infer<typeof orderQueueQuerySchema>;
