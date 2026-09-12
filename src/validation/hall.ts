import { z } from "zod";

import { HALL_STATUSES } from "@/types/status";

export const createHallSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    number: z.number().int().positive().max(10_000),
    status: z.enum(HALL_STATUSES).default("ACTIVE"),
    seatCount: z.number().int().nonnegative().max(10_000).default(0),
  })
  .strict();

export type CreateHallInput = z.input<typeof createHallSchema>;
