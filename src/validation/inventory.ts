import { z } from "zod";

const QUANTITY_PATTERN = /^\d{1,11}(?:\.\d{1,3})?$/;

export function normalizeInventoryDecimal(value: string): string {
  const trimmed = value.trim();
  if (!QUANTITY_PATTERN.test(trimmed)) return trimmed;
  const [whole, fraction = ""] = trimmed.split(".");
  return `${BigInt(whole).toString()}.${fraction.padEnd(3, "0")}`;
}

const decimalString = z
  .string()
  .trim()
  .regex(QUANTITY_PATTERN, "Enter a non-negative quantity with up to three decimal places.")
  .transform(normalizeInventoryDecimal);

export const inventoryQuantitySchema = decimalString;
export const positiveInventoryQuantitySchema = decimalString.refine(
  (value) => value !== "0.000",
  "Quantity must be greater than zero.",
);

export const inventorySkuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(40)
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/, "SKU may contain letters, numbers, hyphens, and underscores.");

export const inventoryItemInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  sku: inventorySkuSchema,
  unit: z.enum(["EACH", "GRAM", "MILLILITER"]),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const inventoryItemUpdateSchema = inventoryItemInputSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, "At least one field must be provided.");

export const inventoryItemListQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(24),
});

export const configureLocationInventorySchema = z.object({
  inventoryItemId: z.string().trim().min(1).max(128),
  lowStockThreshold: inventoryQuantitySchema,
});

export const updateInventoryThresholdSchema = z.object({
  lowStockThreshold: inventoryQuantitySchema,
});

export const stockMovementInputSchema = z
  .object({
    type: z.enum(["RECEIVE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "WASTE"]),
    quantity: positiveInventoryQuantitySchema,
    reason: z.string().trim().max(160).optional().transform((value) => value || null),
    note: z.string().trim().max(500).optional().transform((value) => value || null),
  })
  .superRefine((input, context) => {
    if ((input.type === "ADJUSTMENT_OUT" || input.type === "WASTE") && !input.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is required when reducing stock.",
      });
    }
  });

export const inventoryMovementListQuerySchema = z.object({
  locationId: z.string().trim().min(1).max(128).optional(),
  inventoryItemId: z.string().trim().min(1).max(128).optional(),
  type: z.enum(["RECEIVE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "WASTE"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
}).refine((input) => !input.from || !input.to || input.from <= input.to, {
  path: ["to"],
  message: "End date must be after the start date.",
});

export const recipeComponentInputSchema = z.object({
  inventoryItemId: z.string().trim().min(1).max(128),
  quantityRequired: positiveInventoryQuantitySchema,
});

export const recipeComponentUpdateSchema = z.object({
  quantityRequired: positiveInventoryQuantitySchema,
});
