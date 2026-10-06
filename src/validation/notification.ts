import { z } from "zod";
import { CATEGORIES, NOTIFICATION_TYPES } from "@/lib/notifications/policy";
import { documentIdSchema } from "./shared";
export const notificationQuerySchema = z
  .object({
    view: z.enum(["all", "unread"]).default("all"),
    type: z.enum(NOTIFICATION_TYPES).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export const readNotificationSchema = z
  .object({ id: documentIdSchema.optional(), all: z.boolean().default(false) })
  .strict()
  .refine(
    (v) => (v.all ? !v.id : !!v.id),
    "Choose one notification or mark all.",
  );
export const preferenceSchema = z
  .object({ category: z.enum(CATEGORIES), inAppEnabled: z.boolean() })
  .strict();
