import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkInHash, createSeatAccessCode, validCheckInHash } from "./seat-check-in";
import { redact } from "@/lib/observability/safe";
afterEach(() => vi.unstubAllEnvs());
it("generates zero-padded mobile-friendly codes without weak randomness", () => {
  const codes = new Set(Array.from({ length: 100 }, createSeatAccessCode));
  expect(codes.size).toBe(100);
  for (const code of codes) expect(code).toMatch(/^\d{12}$/);
});
it("fails closed without a configured pepper", () => {
  vi.stubEnv("SECURITY_RATE_LIMIT_SECRET", "");
  expect(() => checkInHash("scope", "123456789012")).toThrow("temporarily unavailable");
});
it("hashes with domain separation and constant-time digest comparison", () => {
  vi.stubEnv("SECURITY_RATE_LIMIT_SECRET", "synthetic-security-pepper-with-more-than-32-characters");
  const hash = checkInHash("seat:screening:grant:version", "123456789012");
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(validCheckInHash(hash, hash)).toBe(true);
  expect(validCheckInHash(hash, checkInHash("different-seat", "123456789012"))).toBe(false);
  expect(validCheckInHash("malformed", hash)).toBe(false);
  expect(validCheckInHash(hash, "malformed")).toBe(false);
});
it("redacts check-in secrets and ticket references from telemetry", () => {
  expect(redact({ accessCode: "123456789012", codeHash: "a".repeat(64), ticketReference: "synthetic-ticket" })).toEqual({ accessCode: "[redacted]", codeHash: "[redacted]", ticketReference: "[redacted]" });
});
