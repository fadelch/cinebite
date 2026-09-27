import { z } from "zod";

import { documentIdSchema, slugSchema } from "@/validation/shared";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value || null);
const localDateTimeSchema = z.string().trim().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
  "Use a complete local date and time.",
);

export const movieInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: slugSchema,
  synopsis: optionalText(4_000),
  durationMinutes: z.coerce.number().int().min(1).max(600),
  language: optionalText(80),
  contentRating: optionalText(30),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const movieUpdateSchema = movieInputSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one movie field must be provided.",
);

export const movieListQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});

export const screeningInputSchema = z.object({
  locationId: documentIdSchema,
  hallId: documentIdSchema,
  movieId: documentIdSchema,
  startsAtLocal: localDateTimeSchema,
  endsAtLocal: localDateTimeSchema,
});

export const screeningUpdateSchema = screeningInputSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one screening field must be provided.",
);

export const scheduleListQuerySchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  locationId: documentIdSchema.optional(),
  hallId: documentIdSchema.optional(),
  movieId: documentIdSchema.optional(),
  state: z.enum(["UPCOMING", "LIVE", "ENDED", "CANCELLED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
