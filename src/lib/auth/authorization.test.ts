import { describe, expect, it } from "vitest";

import {
  canAccessLocation,
  canAccessOrganization,
  canUseOrganization,
  getLandingPathForRole,
  hasRole,
  isRoleLandingPath,
} from "@/lib/auth/authorization";
import type { AuthenticatedUser } from "@/types/auth";
import type { UserRole } from "@/types/status";
import { userProfileDocumentSchema } from "@/validation/user";

const baseUser: AuthenticatedUser = {
  uid: "user-1",
  email: "staff@example.com",
  displayName: "Staff Member",
  role: "LOCATION_MANAGER",
  organizationId: "org-abc",
  locationIds: ["loc-achrafieh"],
  allLocations: false,
  active: true,
};

const timestamp = {
  seconds: 1,
  nanoseconds: 0,
  toDate: () => new Date(1_000),
};

function user(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return { ...baseUser, ...overrides };
}

describe("role landing paths", () => {
  it.each<[UserRole, string]>([
    ["SUPER_ADMIN", "/super-admin"],
    ["CINEMA_ADMIN", "/admin"],
    ["LOCATION_MANAGER", "/admin"],
    ["KITCHEN_STAFF", "/kitchen"],
    ["DELIVERY_STAFF", "/delivery"],
  ])("maps %s to %s", (role, path) => {
    expect(getLandingPathForRole(role)).toBe(path);
    expect(isRoleLandingPath(path)).toBe(true);
  });

  it("rejects non-role destinations", () => {
    expect(isRoleLandingPath("//example.com")).toBe(false);
    expect(isRoleLandingPath("/login")).toBe(false);
  });
});

describe("tenant authorization", () => {
  it("allows an active SUPER_ADMIN to cross organizations", () => {
    const superAdmin = user({
      role: "SUPER_ADMIN",
      organizationId: null,
      locationIds: [],
    });

    expect(canAccessOrganization(superAdmin, "org-empire")).toBe(true);
    expect(canAccessLocation(superAdmin, "org-empire", "loc-dbayeh")).toBe(
      true,
    );
  });

  it("isolates a CINEMA_ADMIN to their organization", () => {
    const cinemaAdmin = user({
      role: "CINEMA_ADMIN",
      allLocations: true,
      locationIds: [],
    });

    expect(canAccessOrganization(cinemaAdmin, "org-abc")).toBe(true);
    expect(canAccessLocation(cinemaAdmin, "org-abc", "loc-dbayeh")).toBe(
      true,
    );
    expect(canAccessOrganization(cinemaAdmin, "org-empire")).toBe(false);
  });

  it("enforces LOCATION_MANAGER location restrictions", () => {
    expect(canAccessLocation(baseUser, "org-abc", "loc-achrafieh")).toBe(true);
    expect(canAccessLocation(baseUser, "org-abc", "loc-dbayeh")).toBe(false);
  });

  it.each<UserRole>(["KITCHEN_STAFF", "DELIVERY_STAFF"])(
    "enforces %s location restrictions",
    (role) => {
      const staff = user({ role });

      expect(canAccessLocation(staff, "org-abc", "loc-achrafieh")).toBe(true);
      expect(canAccessLocation(staff, "org-abc", "loc-dbayeh")).toBe(false);
      expect(canAccessLocation(staff, "org-empire", "loc-achrafieh")).toBe(
        false,
      );
    },
  );

  it("rejects inactive users for every authorization check", () => {
    const inactive = user({ active: false });

    expect(hasRole(inactive, ["LOCATION_MANAGER"])).toBe(false);
    expect(canAccessOrganization(inactive, "org-abc")).toBe(false);
    expect(canAccessLocation(inactive, "org-abc", "loc-achrafieh")).toBe(
      false,
    );
  });

  it("blocks tenant users when their organization is suspended or inactive", () => {
    expect(canUseOrganization(baseUser, "ACTIVE")).toBe(true);
    expect(canUseOrganization(baseUser, "SUSPENDED")).toBe(false);
    expect(canUseOrganization(baseUser, "INACTIVE")).toBe(false);
  });

  it("restores tenant eligibility after organization reactivation", () => {
    expect(canUseOrganization(baseUser, "SUSPENDED")).toBe(false);
    expect(canUseOrganization(baseUser, "ACTIVE")).toBe(true);
  });

  it("allows an active SUPER_ADMIN to manage suspended organizations", () => {
    const superAdmin = user({
      role: "SUPER_ADMIN",
      organizationId: null,
      locationIds: [],
    });

    expect(canUseOrganization(superAdmin, "SUSPENDED")).toBe(true);
    expect(canUseOrganization(superAdmin, "INACTIVE")).toBe(true);
  });
});

describe("UserProfile security invariants", () => {
  const profile = {
    email: "staff@example.com",
    displayName: "Staff Member",
    role: "LOCATION_MANAGER" as const,
    organizationId: "org-abc",
    locationIds: ["loc-achrafieh"],
    allLocations: false,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  it("accepts valid role and tenant combinations", () => {
    expect(userProfileDocumentSchema.safeParse(profile).success).toBe(true);
  });

  it.each([
    {
      ...profile,
      role: "SUPER_ADMIN",
      organizationId: "org-abc",
      locationIds: [],
    },
    {
      ...profile,
      role: "CINEMA_ADMIN",
      locationIds: [],
      allLocations: false,
    },
    { ...profile, role: "LOCATION_MANAGER", locationIds: [] },
    { ...profile, role: "KITCHEN_STAFF", locationIds: [] },
    { ...profile, role: "DELIVERY_STAFF", allLocations: true },
  ])("rejects an invalid profile security combination", (invalidProfile) => {
    expect(userProfileDocumentSchema.safeParse(invalidProfile).success).toBe(
      false,
    );
  });
});
