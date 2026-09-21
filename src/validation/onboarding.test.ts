import { describe, expect, it } from "vitest";

import { organizationOnboardingSchema } from "@/validation/onboarding";

const validOnboarding = {
  organization: {
    name: "Empire Cinemas",
    slug: "empire-cinemas",
    status: "ACTIVE",
  },
  firstLocation: {
    name: "Downtown",
    slug: "downtown",
    status: "ACTIVE",
    address: { line1: "123 Cinema Avenue" },
    city: "Beirut",
    country: "LB",
    timezone: "Asia/Beirut",
  },
  administrator: {
    displayName: "Maya Haddad",
    email: "MAYA@EXAMPLE.COM",
  },
};

type OnboardingOverrides = {
  organization?: Partial<(typeof validOnboarding)["organization"]>;
  firstLocation?: Partial<(typeof validOnboarding)["firstLocation"]>;
  administrator?: Partial<(typeof validOnboarding)["administrator"]>;
};

const invalidCases: Array<[string, OnboardingOverrides]> = [
  ["invalid organization slug", { organization: { slug: "Empire Cinemas" } }],
  ["invalid location slug", { firstLocation: { slug: "Downtown!" } }],
  ["invalid timezone", { firstLocation: { timezone: "Beirut" } }],
  ["invalid country", { firstLocation: { country: "Lebanon" } }],
  ["invalid administrator email", { administrator: { email: "not-email" } }],
];

describe("organizationOnboardingSchema", () => {
  it("validates and normalizes a complete onboarding request", () => {
    const result = organizationOnboardingSchema.parse(validOnboarding);

    expect(result.administrator.email).toBe("maya@example.com");
    expect(result.organization.status).toBe("ACTIVE");
    expect(result.firstLocation.timezone).toBe("Asia/Beirut");
  });

  it.each(invalidCases)("rejects %s", (_label, overrides) => {
    const input = {
      ...validOnboarding,
      organization: {
        ...validOnboarding.organization,
        ...(overrides.organization ?? {}),
      },
      firstLocation: {
        ...validOnboarding.firstLocation,
        ...(overrides.firstLocation ?? {}),
      },
      administrator: {
        ...validOnboarding.administrator,
        ...(overrides.administrator ?? {}),
      },
    };

    expect(organizationOnboardingSchema.safeParse(input).success).toBe(false);
  });
});
