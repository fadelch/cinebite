import { z } from "zod";

import { HALL_STATUSES } from "@/types/status";
import { databaseTimestampSchema } from "@/validation/shared";

export const createHallSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    number: z.number().int().positive().max(10_000),
    status: z.enum(HALL_STATUSES).default("ACTIVE"),
    seatCount: z.number().int().nonnegative().max(10_000).default(0),
  })
  .strict();

/** Browser input never controls the denormalized seat count. */
export const createTenantHallSchema = createHallSchema.omit({
  seatCount: true,
});

export const hallDocumentSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    number: z.number().int().positive().max(10_000),
    status: z.enum(HALL_STATUSES),
    seatCount: z.number().int().nonnegative().max(10_000),
    createdAt: databaseTimestampSchema,
    updatedAt: databaseTimestampSchema,
  })
  .strict();

export const hallStatusChangeSchema = z
  .object({ status: z.enum(HALL_STATUSES) })
  .strict();

export type CreateHallInput = z.input<typeof createHallSchema>;
export type CreateTenantHallInput = z.input<typeof createTenantHallSchema>;
