import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { paymentConfig } from "./config";
import { ServiceError } from "@/server/services/service-error";

export const providerEventSchema = z.object({
  eventId: z.string().min(1).max(150), providerPaymentId: z.string().min(1).max(150),
  attemptId: z.string().min(1).max(150), amountMinor: z.string().regex(/^\d+$/).max(16),
  currencyCode: z.string().regex(/^[A-Z]{3}$/), status: z.enum(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELED"]),
}).strict();
export type ProviderEvent = z.infer<typeof providerEventSchema>;
export type ProviderPayment = Omit<ProviderEvent, "eventId">;
export interface PaymentProvider {
  readonly name: string;
  create(input: { attemptId: string; amountMinor: string; currencyCode: string; expiresAt: Date }): Promise<ProviderPayment>;
  retrieve(providerPaymentId: string): Promise<ProviderPayment>;
  cancel(providerPaymentId: string): Promise<ProviderPayment>;
  verifyWebhook(raw: string, signature: string | null): ProviderEvent;
}

// OUR sandbox protocol, not a substitute for a real provider's official SDK.
// Durable intent ledger simulates an external provider outside settlement transactions.
class SandboxProvider implements PaymentProvider {
  readonly name = "sandbox";
  async create(input: { attemptId: string; amountMinor: string; currencyCode: string; expiresAt: Date }) {
    paymentConfig();
    const row = await prisma.sandboxPaymentIntent.upsert({ where: { attemptId: input.attemptId },
      create: { id: `sandbox_${input.attemptId}`, ...input }, update: {} });
    if (row.amountMinor !== input.amountMinor || row.currencyCode !== input.currencyCode) throw new ServiceError("PAYMENT_CONFLICT", 409, "Payment request changed.");
    return this.dto(row);
  }
  async retrieve(id: string) { return this.dto(await prisma.sandboxPaymentIntent.findUniqueOrThrow({ where: { id } })); }
  async cancel(id: string) {
    await prisma.sandboxPaymentIntent.updateMany({ where: { id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "CANCELED" } });
    return this.retrieve(id);
  }
  verifyWebhook(raw: string, signature: string | null): ProviderEvent {
    const { secret } = paymentConfig();
    if (!signature || !/^\d{10}\.[a-f0-9]{64}$/.test(signature)) throw new ServiceError("PAYMENT_SIGNATURE_INVALID", 400, "Invalid payment signature.");
    const [time, digest] = signature.split(".");
    const expected = createHmac("sha256", secret).update(`${time}.${raw}`).digest();
    if (Math.abs(Date.now() / 1000 - Number(time)) > 300 || !timingSafeEqual(expected, Buffer.from(digest!, "hex"))) throw new ServiceError("PAYMENT_SIGNATURE_INVALID", 400, "Invalid payment signature.");
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw new ServiceError("PAYMENT_SIGNATURE_INVALID", 400, "Invalid payment event."); }
    return providerEventSchema.parse(input);
  }
  private dto(row: { id: string; attemptId: string; amountMinor: string; currencyCode: string; status: ProviderEvent["status"] }): ProviderPayment {
    return { providerPaymentId: row.id, attemptId: row.attemptId, amountMinor: row.amountMinor, currencyCode: row.currencyCode, status: row.status };
  }
}
export function getPaymentProvider(): PaymentProvider { paymentConfig(); return new SandboxProvider(); }
export function sandboxSignature(raw: string, time = Math.floor(Date.now() / 1000)): string {
  return `${time}.${createHmac("sha256", paymentConfig().secret).update(`${time}.${raw}`).digest("hex")}`;
}
