import { z } from "zod";

import { documentIdSchema, slugSchema } from "@/validation/shared";

export const menuStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
const sortOrderSchema = z.coerce.number().int().min(0).max(10_000);
const nameSchema = z.string().trim().min(2).max(100);
const skuSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim().toUpperCase().replace(/\s+/g, "-");
    return normalized || null;
  },
  z.string()
    .max(40, "SKU must contain at most 40 characters.")
    .regex(/^[A-Z0-9._-]+$/, "SKU may use letters, numbers, periods, underscores, and hyphens only.")
    .nullable(),
);

export const menuCategoryInputSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  description: z.string().trim().max(500).nullable().optional().transform((value) => value || null),
  status: menuStatusSchema.default("ACTIVE"),
  sortOrder: sortOrderSchema.default(0),
});

export const menuCategoryUpdateSchema = menuCategoryInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one category field must be provided.",
);

export const priceSchema = z.string().trim()
  .max(20, "Price must be between 0 and 999999.99.")
  .regex(/^\d+(?:\.\d{1,2})?$/, "Price must use digits with at most two decimal places.")
  .transform((value) => {
    const [rawWhole, decimal = ""] = value.split(".");
    const whole = rawWhole.replace(/^0+(?=\d)/, "");
    return `${whole}.${decimal.padEnd(2, "0")}`;
  })
  .refine(
    (value) => BigInt(value.replace(".", "")) <= BigInt("99999999"),
    "Price must be between 0 and 999999.99.",
  );

export const currencyCodeSchema = z.string().trim().toUpperCase().regex(
  /^[A-Z]{3}$/,
  "Currency must be a three-letter code such as USD, LBP, or EUR.",
);

export const productLocationInputSchema = z.object({
  locationId: documentIdSchema,
  price: priceSchema,
  currencyCode: currencyCodeSchema,
  isAvailable: z.boolean(),
});

const productIdentity = z.object({
  name: nameSchema,
  slug: slugSchema,
  categoryId: documentIdSchema,
  description: z.string().trim().min(1).max(2_000),
  sku: skuSchema,
  status: menuStatusSchema.default("ACTIVE"),
  sortOrder: sortOrderSchema.default(0),
});

export const productCreateSchema = productIdentity.extend({
  locations: z.array(productLocationInputSchema).max(100).default([]),
}).superRefine((value, context) => {
  const ids = new Set<string>();
  value.locations.forEach((location, index) => {
    if (ids.has(location.locationId)) context.addIssue({ code: "custom", path: ["locations", index, "locationId"], message: "Each location may be assigned only once." });
    ids.add(location.locationId);
  });
});

export const productUpdateSchema = productIdentity.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one product field must be provided.",
);

export const productLocationUpdateSchema = productLocationInputSchema.omit({ locationId: true });

export const productListQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  categoryId: z.string().trim().max(1_500).optional(),
  status: menuStatusSchema.optional(),
  locationId: z.string().trim().max(1_500).optional(),
  availability: z.enum(["AVAILABLE", "UNAVAILABLE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});
