import { z } from "zod";

import { SEAT_STATUSES } from "@/types/status";
import { databaseTimestampSchema } from "@/validation/shared";

export const SEAT_GENERATION_LIMITS = {
  maxRows: 26,
  maxSeatsPerRow: 30,
  maxTotalSeats: 300,
} as const;

function rowOrdinal(row: string): number {
  return [...row].reduce(
    (value, character) => value * 26 + character.charCodeAt(0) - 64,
    0,
  );
}

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

export const seatDocumentSchema = createSeatSchema.safeExtend({
  status: z.enum(SEAT_STATUSES),
  createdAt: databaseTimestampSchema,
  updatedAt: databaseTimestampSchema,
});

export const generateSeatsSchema = z
  .object({
    startingRow: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{1,3}$/, "Starting row must use letters A-Z."),
    numberOfRows: z
      .number()
      .int()
      .positive()
      .max(
        SEAT_GENERATION_LIMITS.maxRows,
        `Number of rows cannot exceed ${SEAT_GENERATION_LIMITS.maxRows}.`,
      ),
    seatsPerRow: z
      .number()
      .int()
      .positive()
      .max(
        SEAT_GENERATION_LIMITS.maxSeatsPerRow,
        `Seats per row cannot exceed ${SEAT_GENERATION_LIMITS.maxSeatsPerRow}.`,
      ),
    startingSeatNumber: z.number().int().positive().max(9_970),
  })
  .strict()
  .refine(
    (input) => input.numberOfRows * input.seatsPerRow <= SEAT_GENERATION_LIMITS.maxTotalSeats,
    {
      message: `A single generation may contain at most ${SEAT_GENERATION_LIMITS.maxTotalSeats} seats.`,
      path: ["numberOfRows"],
    },
  )
  .refine(
    (input) => input.startingSeatNumber + input.seatsPerRow - 1 <= 9_999,
    {
      message: "The final seat number must not exceed 9999.",
      path: ["startingSeatNumber"],
    },
  )
  .refine(
    (input) =>
      rowOrdinal(input.startingRow) + input.numberOfRows - 1 <=
      rowOrdinal("ZZZ"),
    {
      message: "The final generated row must not exceed ZZZ.",
      path: ["startingRow"],
    },
  );

export const seatStatusChangeSchema = z
  .object({ status: z.enum(SEAT_STATUSES) })
  .strict();

export type CreateSeatInput = z.input<typeof createSeatSchema>;
export type GenerateSeatsInput = z.input<typeof generateSeatsSchema>;
