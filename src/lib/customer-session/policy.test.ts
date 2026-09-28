import { afterEach, describe, expect, it, vi } from "vitest";

import { customerSessionCookieOptions, customerSessionExpiry } from "@/lib/customer-session/policy";

describe("customer session policy", () => {
  afterEach(() => {
    delete process.env.CUSTOMER_SESSION_GRACE_MINUTES;
    delete process.env.CUSTOMER_SESSION_MAX_HOURS;
    vi.unstubAllEnvs();
  });

  it("caps a long screening session at the absolute maximum", () => {
    const now = new Date("2026-09-29T10:00:00.000Z");
    expect(customerSessionExpiry(new Date("2026-09-30T10:00:00.000Z"), now)).toEqual(new Date("2026-09-29T16:00:00.000Z"));
  });

  it("uses the screening end plus a short grace window when earlier", () => {
    const now = new Date("2026-09-29T10:00:00.000Z");
    expect(customerSessionExpiry(new Date("2026-09-29T12:00:00.000Z"), now)).toEqual(new Date("2026-09-29T12:15:00.000Z"));
  });

  it("uses an HttpOnly same-site cookie and Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const options = customerSessionCookieOptions(new Date("2026-09-29T12:00:00.000Z"));
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  });
});
