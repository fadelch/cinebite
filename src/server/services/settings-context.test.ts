import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/server/auth/current-user";
import { settingsActor, settingsScope } from "./settings-context";
import type { AuthenticatedUser } from "@/types/auth";
const admin: AuthenticatedUser = {
  uid: "demo-admin",
  email: "admin@example.test",
  displayName: "Demo Admin",
  role: "CINEMA_ADMIN",
  active: true,
  organizationId: "org",
  allLocations: true,
  locationIds: [],
};
describe("settings/staff authority", () => {
  beforeEach(() => vi.clearAllMocks());
  it("requires authenticated current cinema staff; never platform/customer bypass", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(settingsActor(true)).rejects.toMatchObject({ status: 401 });
    for (const role of [
      "SUPER_ADMIN",
      "LOCATION_MANAGER",
      "KITCHEN_STAFF",
      "DELIVERY_STAFF",
    ] as const) {
      vi.mocked(getCurrentUser).mockResolvedValue({ ...admin, role });
      await expect(settingsActor(true)).rejects.toMatchObject({ status: 403 });
    }
  });
  it("lets managers view but never mutate organizational settings", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      ...admin,
      role: "LOCATION_MANAGER",
    });
    await expect(settingsActor()).resolves.toMatchObject({
      role: "LOCATION_MANAGER",
    });
    await expect(settingsActor(true)).rejects.toMatchObject({ status: 403 });
  });
  it("rechecks PG membership/activity/tenant after locking organization for writes", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      organizationMembership: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            userId: "db-admin",
            organizationId: "org",
            role: "CINEMA_ADMIN",
            organization: { status: "ACTIVE" },
            user: { active: true },
            locationAccess: [],
          }),
      },
    };
    await settingsScope(tx as never, admin, true, true);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.organizationMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org",
          user: {
            firebaseUid: "demo-admin",
            active: true,
            platformRole: "USER",
            authorizationVersion:0,
          },
        },
      }),
    );
    tx.organizationMembership.findFirst.mockResolvedValue(null);
    await expect(
      settingsScope(tx as never, admin, true, true),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects current PG role downgrade or suspended organization despite old actor", async () => {
    const tx = {
      organizationMembership: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            role: "LOCATION_MANAGER",
            organization: { status: "ACTIVE" },
          }),
      },
    };
    await expect(settingsScope(tx as never, admin, true)).rejects.toMatchObject(
      { status: 403 },
    );
    tx.organizationMembership.findFirst.mockResolvedValue({
      role: "CINEMA_ADMIN",
      organization: { status: "SUSPENDED" },
    });
    await expect(settingsScope(tx as never, admin, true)).rejects.toMatchObject(
      { status: 403 },
    );
  });
});
