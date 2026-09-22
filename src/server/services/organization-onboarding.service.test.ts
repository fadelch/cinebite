import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminAuth: vi.fn(),
  getAdminFirestore: vi.fn(),
}));

import {
  createOrganizationOnboardingService,
  type OrganizationOnboardingDependencies,
} from "@/server/services/organization-onboarding.service";
import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";

const superAdmin: AuthenticatedUser = {
  uid: "super-admin-1",
  email: "super@example.com",
  displayName: "Super Admin",
  role: "SUPER_ADMIN",
  organizationId: null,
  locationIds: [],
  allLocations: false,
  active: true,
};

const onboardingInput = {
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
    email: "maya@example.com",
  },
};

function createDependencies(): OrganizationOnboardingDependencies {
  return {
    administratorEmailExists: vi.fn().mockResolvedValue(false),
    createAdministrator: vi.fn().mockResolvedValue({ uid: "admin-1" }),
    setAdministratorClaims: vi.fn().mockResolvedValue(undefined),
    generateSetupLink: vi
      .fn()
      .mockResolvedValue("mock-sensitive-link-value"),
    deleteAdministrator: vi.fn().mockResolvedValue(undefined),
    allocateIds: vi.fn().mockReturnValue({
      organizationId: "org-1",
      locationId: "location-1",
      organizationAuditId: "audit-org-1",
      locationAuditId: "audit-location-1",
      administratorAuditId: "audit-user-1",
    }),
    commitOnboarding: vi.fn().mockResolvedValue(undefined),
  };
}

describe("organization onboarding service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated and non-SUPER_ADMIN actors", async () => {
    const dependencies = createDependencies();
    const onboard = createOrganizationOnboardingService(dependencies);

    await expect(onboard(onboardingInput, null)).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      status: 401,
    });
    await expect(
      onboard(onboardingInput, {
        ...superAdmin,
        role: "CINEMA_ADMIN",
        organizationId: "org-other",
        allLocations: true,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED", status: 403 });
    expect(dependencies.createAdministrator).not.toHaveBeenCalled();
  });

  it("rejects a duplicate administrator email before creating anything", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.administratorEmailExists).mockResolvedValue(true);

    await expect(
      createOrganizationOnboardingService(dependencies)(
        onboardingInput,
        superAdmin,
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_ADMIN_EMAIL", status: 409 });
    expect(dependencies.createAdministrator).not.toHaveBeenCalled();
    expect(dependencies.commitOnboarding).not.toHaveBeenCalled();
  });

  it("creates trusted claims, profile intent, audit events, and returns the setup link", async () => {
    const dependencies = createDependencies();
    const result = await createOrganizationOnboardingService(dependencies)(
      onboardingInput,
      superAdmin,
    );

    expect(dependencies.setAdministratorClaims).toHaveBeenCalledWith(
      "admin-1",
      "org-1",
    );
    const commitInput = vi.mocked(dependencies.commitOnboarding).mock.calls[0][0];
    expect(commitInput.administratorProfile).toEqual({
      displayName: "Maya Haddad",
      email: "maya@example.com",
      role: "CINEMA_ADMIN",
      organizationId: "org-1",
      locationIds: [],
      allLocations: true,
      active: true,
    });
    expect(commitInput.auditEvents.map((event) => event.action)).toEqual([
      "ORGANIZATION_CREATED",
      "LOCATION_CREATED",
      "CINEMA_ADMIN_CREATED",
    ]);
    expect(JSON.stringify(commitInput)).not.toContain(result.setupLink);
    expect(result).toEqual({
      organizationId: "org-1",
      locationId: "location-1",
      administratorUid: "admin-1",
      setupLink: "mock-sensitive-link-value",
    });
  });

  it("cleans up the new Auth user when Firestore onboarding fails", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.commitOnboarding).mockRejectedValue(
      new Error("Firestore unavailable"),
    );

    await expect(
      createOrganizationOnboardingService(dependencies)(
        onboardingInput,
        superAdmin,
      ),
    ).rejects.toMatchObject({ code: "ONBOARDING_FAILED", status: 500 });
    expect(dependencies.deleteAdministrator).toHaveBeenCalledWith("admin-1");
  });

  it("preserves a duplicate slug error and cleans up the newly created Auth user", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.commitOnboarding).mockRejectedValue(
      new ServiceError(
        "DUPLICATE_ORGANIZATION_SLUG",
        409,
        "This organization slug is already in use.",
      ),
    );

    await expect(
      createOrganizationOnboardingService(dependencies)(
        onboardingInput,
        superAdmin,
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_ORGANIZATION_SLUG" });
    expect(dependencies.deleteAdministrator).toHaveBeenCalledWith("admin-1");
  });

  it("cleans up the new Auth user when custom claim assignment fails", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.setAdministratorClaims).mockRejectedValue(
      new Error("Claim failure"),
    );

    await expect(
      createOrganizationOnboardingService(dependencies)(
        onboardingInput,
        superAdmin,
      ),
    ).rejects.toMatchObject({ code: "ONBOARDING_FAILED" });
    expect(dependencies.deleteAdministrator).toHaveBeenCalledWith("admin-1");
    expect(dependencies.commitOnboarding).not.toHaveBeenCalled();
  });
});
