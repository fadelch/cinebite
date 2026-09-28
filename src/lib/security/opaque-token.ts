import { createHash, randomBytes } from "node:crypto";

export const OPAQUE_TOKEN_BYTES = 32;
export const OPAQUE_TOKEN_LENGTH = 43;

export function createOpaqueToken(): string {
  return randomBytes(OPAQUE_TOKEN_BYTES).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
