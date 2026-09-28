import { describe, expect, it } from "vitest";

import { createOpaqueToken, hashOpaqueToken, OPAQUE_TOKEN_BYTES, OPAQUE_TOKEN_LENGTH } from "@/lib/security/opaque-token";

describe("opaque credential security", () => {
  it("creates URL-safe credentials with 256 bits of secure randomness", () => {
    const values = new Set(Array.from({ length: 128 }, () => createOpaqueToken()));
    expect(OPAQUE_TOKEN_BYTES).toBe(32);
    expect(values.size).toBe(128);
    for (const value of values) {
      expect(value).toHaveLength(OPAQUE_TOKEN_LENGTH);
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("stores a deterministic SHA-256 hash rather than the raw credential", () => {
    const token = createOpaqueToken();
    const hash = hashOpaqueToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
    expect(hash).not.toContain(token);
  });
});
