import { z } from "zod";

import { LOCATION_STATUSES } from "@/types/status";
import { databaseTimestampSchema, slugSchema } from "@/validation/shared";

export const addressSchema = z
  .object({
    line1: z.string().trim().min(2).max(160),
    line2: z.string().trim().min(1).max(160).optional(),
    postalCode: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

const timezoneSchema = z.string().trim().refine(
  (timezone) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Timezone must be a valid IANA timezone." },
);

const locationFields = {
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  status: z.enum(LOCATION_STATUSES),
  address: addressSchema,
  city: z.string().trim().min(2).max(100),
  country: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "Country must be a two-letter ISO code."),
  timezone: timezoneSchema,
};

export const createLocationSchema = z
  .object({
    ...locationFields,
    status: locationFields.status.default("ACTIVE"),
  })
  .strict();

export const locationDocumentSchema = z
  .object({
    ...locationFields,
    createdAt: databaseTimestampSchema,
    updatedAt: databaseTimestampSchema,
  })
  .strict();

export type CreateLocationInput = z.input<typeof createLocationSchema>;
