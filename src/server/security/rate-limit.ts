import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/db/prisma";
import { ServiceError } from "@/server/services/service-error";

export interface RatePolicy {
  name: string;
  limit: number;
  seconds: number;
}
export function rateKey(policy: RatePolicy, subject: string, window: number) {
  const configured = process.env.SECURITY_RATE_LIMIT_SECRET;
  if (
    (!configured || configured.length < 32) &&
    process.env.NODE_ENV === "production"
  )
    throw new ServiceError(
      "SECURITY_UNAVAILABLE",
      503,
      "Security protection is temporarily unavailable.",
    );
  return createHmac(
    "sha256",
    configured || "development-only-not-for-production",
  )
    .update(`${policy.name}\0${subject}\0${window}`)
    .digest("hex");
}
export function networkSubject(headers: Headers) {
  // Deployment must OVERWRITE this one header and block direct origin access.
  const configured = process.env.SECURITY_CLIENT_IP_HEADER;
  if (
    process.env.SECURITY_TRUST_PROXY === "true" &&
    ["x-real-ip", "x-vercel-forwarded-for"].includes(configured ?? "")
  ) {
    const value = headers.get(configured!) ?? "";
    if (value.length <= 45 && isIP(value)) return `ip:${value}`;
  }
  // No fingerprint or guessed forwarded-chain IP; safe deployment-wide fallback.
  return "deployment";
}
export async function consumeRateLimit(
  policy: RatePolicy,
  subject: string,
  now = Date.now(),
) {
  const window = Math.floor(now / (policy.seconds * 1000));
  const key = rateKey(policy, subject, window);
  const expiresAt = new Date((window + 1) * policy.seconds * 1000);
  // Separate autocommit statement: denied business transactions never roll back counters.
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO security_rate_limits (key, count, "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT (key) DO UPDATE SET count=LEAST(security_rate_limits.count+1, 1000000)
    RETURNING count`;
  if (rows[0].count > policy.limit)
    throw new ServiceError(
      "SECURITY_RATE_LIMITED",
      429,
      "Too many requests. Please wait before trying again.",
    );
}

export const RATE_POLICIES = {
  auth: { name: "auth", limit: 30, seconds: 60 },
  start: { name: "start", limit: 30, seconds: 60 },
  qr: { name: "qr", limit: 60, seconds: 60 },
  customer: { name: "customer", limit: 120, seconds: 60 },
  checkout: { name: "checkout", limit: 12, seconds: 60 },
  staff: { name: "staff", limit: 120, seconds: 60 },
  invite: { name: "invite", limit: 10, seconds: 600 },
  upload: { name: "upload", limit: 20, seconds: 60 },
  refund: { name: "refund", limit: 12, seconds: 60 },
  report: { name: "report", limit: 30, seconds: 60 },
  webhook: { name: "webhook", limit: 600, seconds: 60 },
} satisfies Record<string, RatePolicy>;

export function anonymousPolicy(
  policy: RatePolicy,
  subject: string,
): RatePolicy {
  // Without trusted client IP, a shared cinema/network needs a much higher ceiling.
  return subject === "deployment"
    ? { ...policy, limit: policy.limit * 20 }
    : policy;
}
