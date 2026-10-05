import "server-only";
import { z } from "zod";
import { ServiceError } from "@/server/services/service-error";

export function paymentConfig() {
  if (process.env.PAYMENT_PROVIDER !== "sandbox" || process.env.PAYMENT_SANDBOX_ENABLED !== "true") {
    throw new ServiceError("PAYMENT_DISABLED", 503, "Online payments are not configured. No money has been charged.");
  }
  const config = z.object({ secret: z.string().min(32), minutes: z.coerce.number().int().min(1).max(15) }).safeParse({
    secret: process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET, minutes: process.env.PAYMENT_RESERVATION_MINUTES ?? "12",
  });
  if (!config.success) throw new ServiceError("PAYMENT_DISABLED", 503, "Sandbox payment configuration is incomplete.");
  return config.data;
}
