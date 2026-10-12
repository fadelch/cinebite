import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
import { USER_ROLES } from "@/types/status";
import type { AuthenticatedUser } from "@/types/auth";
import {
  hasRole,
  canAccessOrganization,
  canAccessLocation,
  canUseOrganization,
  isRoleLandingPath,
} from "@/lib/auth/authorization";
import {
  assertMutationActor,
  assertPlatformMutation,
} from "@/server/auth/mutation-scope";
import { requireRole } from "@/server/auth/guards";
import { getCurrentUser } from "@/server/auth/current-user";
import {
  requireMenuActor,
  requireCatalogEditor,
} from "@/server/services/menu.service";

const staff = (role: AuthenticatedUser["role"]): AuthenticatedUser => ({
  uid: "fixture",
  email: "fixture@example.test",
  displayName: "Demo",
  active: true,
  role,
  organizationId: role === "SUPER_ADMIN" ? null : "org-a",
  locationIds: ["a1"],
  allLocations: false,
  authorizationVersion: 0,
});
describe("security role / tenant / location matrix", () => {
  it("rechecks current active SUPER_ADMIN at the provisioning commit boundary", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      assertPlatformMutation(tx as never, "uid"),
    ).rejects.toMatchObject({ status: 403 });
    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          firebaseUid: "uid",
          active: true,
          platformRole: "SUPER_ADMIN",
        },
      }),
    );
    tx.user.findFirst.mockResolvedValue({ id: "platform" } as never);
    await expect(
      assertPlatformMutation(tx as never, "uid"),
    ).resolves.toBeUndefined();
  });
  it.each(USER_ROLES)(
    "checks %s boundaries and never grants catalog edits to other roles",
    (role) => {
      const user = staff(role);
      expect(hasRole(user, ["CINEMA_ADMIN"])).toBe(role === "CINEMA_ADMIN");
      expect(canAccessOrganization(user, "org-b")).toBe(role === "SUPER_ADMIN");
      expect(canAccessLocation(user, "org-a", "a2")).toBe(
        role === "SUPER_ADMIN",
      );
      expect(canUseOrganization(user, "SUSPENDED")).toBe(
        role === "SUPER_ADMIN",
      );
      if (["CINEMA_ADMIN", "LOCATION_MANAGER"].includes(role)) {
        const actor = requireMenuActor(user);
        if (role === "CINEMA_ADMIN")
          expect(() => requireCatalogEditor(actor)).not.toThrow();
        else expect(() => requireCatalogEditor(actor)).toThrow();
      } else expect(() => requireMenuActor(user)).toThrow();
    },
  );
  it("fails closed for inactive, unknown role, no membership, empty IDs and anonymous", async () => {
    for (const user of [
      { ...staff("CINEMA_ADMIN"), active: false },
      { ...staff("CINEMA_ADMIN"), role: "UNKNOWN" },
      { ...staff("KITCHEN_STAFF"), organizationId: null },
    ] as AuthenticatedUser[]) {
      expect(canAccessOrganization(user, "org-a")).toBe(false);
      expect(canAccessLocation(user, "org-a", "a1")).toBe(false);
    }
    expect(canAccessLocation(staff("SUPER_ADMIN"), "org-a", "")).toBe(false);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(requireRole("SUPER_ADMIN")).rejects.toMatchObject({
      status: 401,
    });
    vi.mocked(getCurrentUser).mockResolvedValue(staff("CINEMA_ADMIN"));
    await expect(requireRole("SUPER_ADMIN")).rejects.toMatchObject({
      status: 403,
    });
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/admin/../evil",
    "javascript:alert(1)",
    "/admin?returnTo=evil",
  ])("rejects arbitrary login landing %s", (value) =>
    expect(isRoleLandingPath(value)).toBe(false),
  );
  it("rechecks current transaction membership and locks authorization before writing", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      organizationMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      assertMutationActor(tx as never, "uid", "org-a", "a1", true),
    ).rejects.toMatchObject({ status: 403 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.organizationMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-a",
          organization: { status: "ACTIVE" },
          user: { firebaseUid: "uid", active: true, platformRole: "USER" },
          role: { in: ["CINEMA_ADMIN"] },
        }),
      }),
    );
    tx.organizationMembership.findFirst.mockResolvedValue({
      role: "LOCATION_MANAGER",
      allLocations: false,
      locationAccess: [{ locationId: "a1" }],
    } as never);
    await expect(
      assertMutationActor(tx as never, "uid", "org-a", "a2"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertMutationActor(tx as never, "uid", "org-a", "a1"),
    ).resolves.toBeUndefined();
  });
});
