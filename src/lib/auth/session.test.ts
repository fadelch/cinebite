import { describe, expect, it } from "vitest";

import { isRecentLogin } from "@/lib/auth/session";

const currentTimeSeconds = 2_000_000_000;
const currentTimeMilliseconds = currentTimeSeconds * 1_000;

describe("isRecentLogin", () => {
  it("accepts a newly authenticated token", () => {
    expect(isRecentLogin(currentTimeSeconds, currentTimeMilliseconds)).toBe(
      true,
    );
  });

  it("allows small differences between the server and token issuer clocks", () => {
    expect(isRecentLogin(currentTimeSeconds + 5, currentTimeMilliseconds)).toBe(
      true,
    );
  });

  it("rejects a token too far ahead of the server clock", () => {
    expect(
      isRecentLogin(currentTimeSeconds + 61, currentTimeMilliseconds),
    ).toBe(false);
  });

  it("rejects a login older than five minutes", () => {
    expect(
      isRecentLogin(currentTimeSeconds - 301, currentTimeMilliseconds),
    ).toBe(false);
  });
});
