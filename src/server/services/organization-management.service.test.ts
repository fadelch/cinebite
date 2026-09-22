import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: vi.fn(),
}));
vi.mock("@/server/repositories/super-admin.repository", () => ({}));

import {
  createOrganizationManagementService,
  type OrganizationManagementDependencies,
} from "@/server/services/organization-management.service";
import type { AuthenticatedUser } from "@/types/auth";

const actor: AuthenticatedUser = {
  uid: "super-admin-1",
  email: "super@example.com",
  displayName: "Super Admin",
  role: "SUPER_ADMIN",
  organizationId: null,
  locationIds: [],
  allLocations: false,
  active: true,
};

const timestamp = {
  seconds: 1,
  nanoseconds: 0,
  toDate: () => new Date(1_000),
};

function dependencies(): OrganizationManagementDependencies {
  return {
    allocateLocationIds: vi.fn().mockReturnValue({
      locationId: "location-2",
      auditLogId: "audit-location-2",
    }),
    addLocation: vi.fn().mockResolvedValue({
      id: "location-2",
      organizationId: "org-1",
      name: "North Mall",
      slug: "north-mall",
      status: "ACTIVE",
      address: { line1: "45 North Street" },
      city: "Beirut",
      country: "LB",
      timezone: "Asia/Beirut",
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    allocateStatusAuditId: vi.fn().mockReturnValue("audit-status-1"),
    updateStatus: vi.fn().mockResolvedValue({
      id: "org-1",
      name: "Empire Cinemas",
      slug: "empire-cinemas",
      status: "SUSPENDED",
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  };
}

const locationInput = {
  name: "North Mall",
  slug: "north-mall",
  status: "ACTIVE",
  address: { line1: "45 North Street" },
  city: "Beirut",
  country: "LB",
  timezone: "Asia/Beirut",
};

describe("organization management service", () => {
  it("rejects unauthenticated and CINEMA_ADMIN callers", async () => {
    const service = createOrganizationManagementService(dependencies());

    await expect(service.addLocation("org-1", locationInput, null)).rejects.toMatchObject({ status: 401 });
    await expect(
      service.addLocation("org-1", locationInput, {
        ...actor,
        role: "CINEMA_ADMIN",
        organizationId: "org-1",
        allLocations: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("scopes location creation and its audit event to the requested organization", async () => {
    const data = dependencies();
    await createOrganizationManagementService(data).addLocation(
      "org-1",
      locationInput,
      actor,
    );

    expect(data.addLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: "super-admin-1",
        organizationId: "org-1",
        locationId: "location-2",
        auditAction: "LOCATION_CREATED",
        location: expect.objectContaining({ slug: "north-mall" }),
      }),
    );
  });

  it.each([
    ["SUSPENDED", "ORGANIZATION_SUSPENDED"],
    ["ACTIVE", "ORGANIZATION_REACTIVATED"],
  ] as const)("creates the correct audit intent for %s", async (status, action) => {
    const data = dependencies();
    await createOrganizationManagementService(data).updateStatus(
      "org-1",
      { status },
      actor,
    );

    expect(data.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUid: "super-admin-1",
        status,
        auditAction: action,
      }),
    );
  });
});
