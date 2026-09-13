import { describe, expect, it } from "vitest";

import { claimsMatchProfile } from "@/lib/auth/claims";

const superAdminProfile = {
  email: "admin@example.com",
  role: "SUPER_ADMIN",
  organizationId: null,
} as const;

describe("claimsMatchProfile", () => {
  it("accepts a missing organization claim for a SUPER_ADMIN session cookie", () => {
    expect(
      claimsMatchProfile(
        {
          email: "admin@example.com",
          role: "SUPER_ADMIN",
        },
        superAdminProfile,
      ),
    ).toBe(true);
  });

  it("accepts matching tenant claims", () => {
    expect(
      claimsMatchProfile(
        {
          email: "staff@example.com",
          role: "LOCATION_MANAGER",
          organizationId: "org-abc",
        },
        {
          email: "staff@example.com",
          role: "LOCATION_MANAGER",
          organizationId: "org-abc",
        },
      ),
    ).toBe(true);
  });

  it("does not let a missing organization claim match a tenant profile", () => {
    expect(
      claimsMatchProfile(
        {
          email: "staff@example.com",
          role: "LOCATION_MANAGER",
        },
        {
          email: "staff@example.com",
          role: "LOCATION_MANAGER",
          organizationId: "org-abc",
        },
      ),
    ).toBe(false);
  });

  it("rejects role and email mismatches", () => {
    expect(
      claimsMatchProfile(
        {
          email: "other@example.com",
          role: "LOCATION_MANAGER",
          organizationId: null,
        },
        superAdminProfile,
      ),
    ).toBe(false);
  });
});
