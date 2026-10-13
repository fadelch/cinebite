import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { ServiceError } from "@/server/services/service-error";

export const CHECK_IN_LIFETIME_MS = 10 * 60_000;
export const CHECK_IN_MAX_ATTEMPTS = 5;

export function createSeatAccessCode() {
  return randomInt(1_000_000_000_000).toString().padStart(12, "0");
}

export function checkInHash(context: string, value: string) {
  const secret = process.env.SECURITY_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new ServiceError("SECURITY_UNAVAILABLE", 503, "Seat verification is temporarily unavailable.");
  return createHmac("sha256", secret).update(`seat-check-in\0${context}\0${value}`).digest("hex");
}

export function validCheckInHash(expected: string, actual: string) {
  return /^[a-f0-9]{64}$/.test(expected) && /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}
