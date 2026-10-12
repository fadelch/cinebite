import { z } from "zod";
import { documentIdSchema } from "./shared";

export const STAFF_ROLES = [
  "CINEMA_ADMIN",
  "LOCATION_MANAGER",
  "KITCHEN_STAFF",
  "DELIVERY_STAFF",
] as const;
export const BRAND_ACCENTS = ["AMBER", "TEAL", "VIOLET"] as const;
export const settingsRevision = z.number().int().min(0).max(2147483646);
export const safeName = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .refine(
    (value) => !/[<>\u0000-\u001f]/.test(value),
    "Use plain text, not HTML or control characters.",
  );
const nullableText = (schema: z.ZodString) =>
  z
    .union([schema, z.literal("")])
    .nullable()
    .transform((value) => value || null);
export const organizationSettingsSchema = z
  .object({
    name: safeName,
    customerFacingName: nullableText(
      z
        .string()
        .trim()
        .max(120)
        .refine((value) => !/[<>\u0000-\u001f]/.test(value)),
    ),
    supportEmail: nullableText(z.string().trim().email().max(254)),
    supportPhone: nullableText(
      z
        .string()
        .trim()
        .max(40)
        .regex(/^[+\d\s()./-]+$/),
    ),
    website: nullableText(
      z
        .string()
        .trim()
        .url()
        .max(2048)
        .refine((value) => {
          const u = new URL(value);
          return u.protocol === "https:" && !u.username && !u.password;
        }, "Use a HTTPS URL without embedded credentials."),
    ),
    version: settingsRevision,
  })
  .strict();
export const brandingSettingsSchema = z
  .object({ accent: z.enum(BRAND_ACCENTS), version: settingsRevision })
  .strict();
export const logoChangeSchema = z
  .object({ version: settingsRevision })
  .strict();
export const ianaTimezone = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => {
    if (
      value !== "UTC" &&
      !/^[A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?$/.test(value)
    )
      return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a named IANA timezone, not a fixed offset.");
export const locationSettingsSchema = z
  .object({
    name: safeName,
    addressLine1: z.string().trim().min(2).max(160),
    addressLine2: nullableText(z.string().trim().max(160)),
    postalCode: nullableText(z.string().trim().max(20)),
    city: z.string().trim().min(2).max(100),
    country: z.string().regex(/^[A-Z]{2}$/),
    timezone: ianaTimezone,
    confirmTimezoneChange: z.boolean().default(false),
    version: settingsRevision,
  })
  .strict();
const staffFields = {
  displayName: safeName,
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  role: z.enum(STAFF_ROLES),
  locationIds: z.array(documentIdSchema).max(100),
};
function locationPolicy(
  value: { role: string; locationIds: string[] },
  ctx: z.RefinementCtx,
) {
  if (new Set(value.locationIds).size !== value.locationIds.length)
    ctx.addIssue({
      code: "custom",
      path: ["locationIds"],
      message: "Choose each location only once.",
    });
  if (value.role === "CINEMA_ADMIN" && value.locationIds.length)
    ctx.addIssue({
      code: "custom",
      path: ["locationIds"],
      message:
        "Cinema Admin has organization-wide access; do not submit individual locations.",
    });
  if (value.role !== "CINEMA_ADMIN" && !value.locationIds.length)
    ctx.addIssue({
      code: "custom",
      path: ["locationIds"],
      message: "This role requires at least one location.",
    });
}
export const inviteStaffSchema = z
  .object(staffFields)
  .strict()
  .superRefine(locationPolicy);
export const editStaffSchema = z
  .object({
    displayName: staffFields.displayName,
    role: staffFields.role,
    locationIds: staffFields.locationIds,
    revision: settingsRevision,
    confirmedRoleChange: z.boolean().default(false),
  })
  .strict()
  .superRefine(locationPolicy);
export const staffStatusSchema = z
  .object({
    active: z.boolean(),
    revision: settingsRevision,
    confirmed: z.literal(true),
  })
  .strict();
export const staffSetupSchema = z
  .object({ revision: settingsRevision, confirmed: z.literal(true) })
  .strict();
export const staffListSchema = z
  .object({
    search: z.string().trim().max(100).default(""),
    role: z.enum(STAFF_ROLES).optional(),
    status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]).optional(),
    locationId: documentIdSchema.optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
