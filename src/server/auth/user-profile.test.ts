import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

import { getUserProfile } from "@/server/auth/user-profile";

const now = new Date("2026-09-22T12:00:00.000Z");

describe("PostgreSQL user profile loading", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps a platform Super Admin without requiring a membership", async () => {
    database.user.findUnique.mockResolvedValue({
      id: "db-user-1",
      firebaseUid: "firebase-1",
      email: "super@example.com",
      displayName: "Super Admin",
      active: true,
      platformRole: "SUPER_ADMIN",
      createdAt: now,
      updatedAt: now,
      memberships: [],
    });

    await expect(getUserProfile("firebase-1")).resolves.toMatchObject({
      uid: "firebase-1",
      role: "SUPER_ADMIN",
      organizationId: null,
      locationIds: [],
    });
  });

  it("uses the claimed organization only to select a current database membership", async () => {
    database.user.findUnique.mockResolvedValue({
      id: "db-user-2",
      firebaseUid: "firebase-2",
      email: "manager@example.com",
      displayName: "Manager",
      active: true,
      platformRole: "USER",
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          organizationId: "org-1",
          role: "LOCATION_MANAGER",
          allLocations: false,
          locationAccess: [{ locationId: "location-1" }],
        },
        {
          organizationId: "org-2",
          role: "KITCHEN_STAFF",
          allLocations: false,
          locationAccess: [{ locationId: "location-2" }],
        },
      ],
    });

    await expect(getUserProfile("firebase-2", "org-1")).resolves.toMatchObject({
      role: "LOCATION_MANAGER",
      organizationId: "org-1",
      locationIds: ["location-1"],
    });
    await expect(getUserProfile("firebase-2", "org-attacker")).resolves.toBeNull();
  });

  it("fails closed when a tenant user has ambiguous memberships and no claim hint", async () => {
    database.user.findUnique.mockResolvedValue({
      id: "db-user-3",
      firebaseUid: "firebase-3",
      email: "staff@example.com",
      displayName: "Staff",
      active: true,
      platformRole: "USER",
      createdAt: now,
      updatedAt: now,
      memberships: [
        { organizationId: "org-1", role: "KITCHEN_STAFF", allLocations: false, locationAccess: [] },
        { organizationId: "org-2", role: "KITCHEN_STAFF", allLocations: false, locationAccess: [] },
      ],
    });

    await expect(getUserProfile("firebase-3")).resolves.toBeNull();
  });
});
