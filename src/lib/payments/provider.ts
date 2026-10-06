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
export const refundEventSchema = z.object({ kind: z.literal("refund"), eventId: z.string().min(1).max(150),
  refundId: z.string().min(1).max(150), providerRefundId: z.string().min(1).max(150), providerPaymentId: z.string().min(1).max(150),
  amountMinor: z.string().regex(/^\d+$/).max(16), currencyCode: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELED"]) }).strict();
export type ProviderRefundEvent = z.infer<typeof refundEventSchema>;
export type ProviderRefund = Omit<ProviderRefundEvent, "eventId" | "kind">;
export interface PaymentProvider {
  readonly name: string;
  create(input: { attemptId: string; amountMinor: string; currencyCode: string; expiresAt: Date }): Promise<ProviderPayment>;
  retrieve(providerPaymentId: string): Promise<ProviderPayment>;
  cancel(providerPaymentId: string): Promise<ProviderPayment>;
  createRefund(input: { refundId: string; providerPaymentId: string; amountMinor: string; currencyCode: string }): Promise<ProviderRefund>;
  retrieveRefund(providerRefundId: string): Promise<ProviderRefund>;
  verifyWebhook(raw: string, signature: string | null): ProviderEvent | ProviderRefundEvent;
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
  async createRefund(input: { refundId: string; providerPaymentId: string; amountMinor: string; currencyCode: string }): Promise<ProviderRefund> {
    paymentConfig();
    const row = await prisma.$transaction(async (tx) => {
      // This ledger represents the provider's own independent capture/refund limit.
      await tx.$queryRaw`SELECT id FROM sandbox_payment_intents WHERE id = ${input.providerPaymentId} FOR UPDATE`;
      const original = await tx.sandboxPaymentIntent.findUniqueOrThrow({ where: { id: input.providerPaymentId } });
      const replay = await tx.sandboxRefundIntent.findUnique({ where: { refundId: input.refundId } });
      if (replay) {
        if (replay.amountMinor !== input.amountMinor || replay.currencyCode !== input.currencyCode || replay.providerPaymentId !== input.providerPaymentId) throw new ServiceError("REFUND_CONFLICT", 409, "Refund request changed.");
        return replay;
      }
      const refunds = await tx.sandboxRefundIntent.findMany({ where: { providerPaymentId: input.providerPaymentId, status: { in: ["PENDING", "PROCESSING", "SUCCEEDED"] } } });
      const exposure = refunds.reduce((sum, r) => sum + BigInt(r.amountMinor), BigInt(0));
      if (original.status !== "SUCCEEDED" || original.currencyCode !== input.currencyCode || BigInt(input.amountMinor) <= BigInt(0)
        || exposure + BigInt(input.amountMinor) > BigInt(original.amountMinor)) throw new ServiceError("REFUND_LIMIT_EXCEEDED", 409, "Provider refund limit exceeded.");
      return tx.sandboxRefundIntent.create({ data: { id: `sandbox_refund_${input.refundId}`, ...input } });
    });
    return { providerRefundId: row.id, refundId: row.refundId, providerPaymentId: row.providerPaymentId, amountMinor: row.amountMinor, currencyCode: row.currencyCode, status: row.status };
  }
  async retrieveRefund(id: string): Promise<ProviderRefund> {
    const row = await prisma.sandboxRefundIntent.findUniqueOrThrow({ where: { id } });
    return { providerRefundId: row.id, refundId: row.refundId, providerPaymentId: row.providerPaymentId, amountMinor: row.amountMinor, currencyCode: row.currencyCode, status: row.status };
  }
  verifyWebhook(raw: string, signature: string | null): ProviderEvent | ProviderRefundEvent {
    const { secret } = paymentConfig();
    if (!signature || !/^\d{10}\.[a-f0-9]{64}$/.test(signature)) throw new ServiceError("PAYMENT_SIGNATURE_INVALID", 400, "Invalid payment signature.");
    const [time, digest] = signature.split(".");
    const expected = createHmac("sha256", secret).update(`${time}.${raw}`).digest();
    if (Math.abs(Date.now() / 1000 - Number(time)) > 300 || !timingSafeEqual(expected, Buffer.from(digest!, "hex"))) throw new ServiceError("PAYMENT_SIGNATURE_INVALID", 400, "Invalid payment signature.");
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw new ServiceError("PAYMENT_SIGNATURE_INVALID", 400, "Invalid payment event."); }
    return z.union([providerEventSchema, refundEventSchema]).parse(input);
  }
  private dto(row: { id: string; attemptId: string; amountMinor: string; currencyCode: string; status: ProviderEvent["status"] }): ProviderPayment {
    return { providerPaymentId: row.id, attemptId: row.attemptId, amountMinor: row.amountMinor, currencyCode: row.currencyCode, status: row.status };
  }
}
export function getPaymentProvider(): PaymentProvider { paymentConfig(); return new SandboxProvider(); }
export function sandboxSignature(raw: string, time = Math.floor(Date.now() / 1000)): string {
  return `${time}.${createHmac("sha256", paymentConfig().secret).update(`${time}.${raw}`).digest("hex")}`;
}
