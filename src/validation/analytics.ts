import { z } from "zod";
import { documentIdSchema } from "./shared";

export const REPORTS = [
  "overview",
  "revenue",
  "orders",
  "products",
  "categories",
  "locations",
  "movies",
  "screenings",
  "halls",
  "operations",
  "inventory",
] as const;
const optionalId = z.union([documentIdSchema, z.literal("")]).optional();
export const analyticsFilterSchema = z
  .object({
    report: z.enum(REPORTS).default("overview"),
    period: z
      .enum([
        "today",
        "yesterday",
        "7d",
        "30d",
        "month",
        "previous-month",
        "custom",
      ])
      .default("30d"),
    start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    end: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    timezone: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => {
        if (!/^(UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+)$/.test(value))
          return false;
        try {
          new Intl.DateTimeFormat("en", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }, "Use an IANA timezone such as Asia/Beirut.")
      .optional(),
    locationId: optionalId,
    movieId: optionalId,
    screeningId: optionalId,
    currencyCode: z
      .union([z.string().regex(/^[A-Z]{3}$/), z.literal("")])
      .optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sort: z
      .enum([
        "name",
        "gross",
        "paidOrders",
        "units",
        "createdAt",
        "consumed",
        "preparationMean",
      ])
      .default("gross"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();
export type AnalyticsFilters = z.infer<typeof analyticsFilterSchema>;
export type ReportName = AnalyticsFilters["report"];
