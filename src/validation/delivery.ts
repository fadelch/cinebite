import { z } from "zod";
import { orderQueueQuerySchema } from "@/validation/kitchen";
export const deliveryTransitionSchema = z.object({
  expectedStatus: z.enum(["READY", "OUT_FOR_DELIVERY"]), toStatus: z.enum(["OUT_FOR_DELIVERY", "DELIVERED"]),
}).strict().refine((v) => (v.expectedStatus === "READY" && v.toStatus === "OUT_FOR_DELIVERY") || (v.expectedStatus === "OUT_FOR_DELIVERY" && v.toStatus === "DELIVERED"),
{ message: "Claim a ready order before marking it delivered.", path: ["toStatus"] });
export const deliveryQueueQuerySchema = orderQueueQuerySchema.omit({ status: true }).extend({ staffId: z.string().trim().min(1).max(128).optional() });
export type DeliveryQueueQuery = z.infer<typeof deliveryQueueQuerySchema>;
export type DeliveryTransition = z.infer<typeof deliveryTransitionSchema>;
