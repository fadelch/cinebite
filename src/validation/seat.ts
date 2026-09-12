import { z } from "zod";

import { SEAT_STATUSES } from "@/types/status";

export const createSeatSchema = z
  .object({
    row: z
      .string()
      .trim()
      .min(1)
      .max(3)
      .regex(/^[A-Z]+$/, "Seat row must use uppercase letters."),
    number: z.number().int().positive().max(9_999),
    label: z
      .string()
      .trim()
      .max(7)
      .regex(/^[A-Z]{1,3}[1-9]\d{0,3}$/, "Seat label must look like G12."),
    status: z.enum(SEAT_STATUSES).default("ACTIVE"),
  })
  .strict()
  .refine((seat) => seat.label === `${seat.row}${seat.number}`, {
    message: "Seat label must match its row and number.",
    path: ["label"],
  });

export type CreateSeatInput = z.input<typeof createSeatSchema>;
