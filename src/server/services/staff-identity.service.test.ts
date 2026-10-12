import { beforeEach, describe, it, expect, vi } from "vitest";
const { database, auth } = vi.hoisted(() => ({
  database: {
    user: {
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  auth: {
    getUser: vi.fn(),
    revokeRefreshTokens: vi.fn(),
    setCustomUserClaims: vi.fn(),
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: () => auth }));
import { synchronizeStaffIdentity } from "./staff-identity.service";
describe("durable identity synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.user.updateMany.mockResolvedValue({ count: 1 });
    database.user.findUniqueOrThrow.mockResolvedValue({
      firebaseUid: "demo-uid",
      email: "demo@example.test",
      authorizationVersion: 3,
      memberships: [{ organizationId: "org", role: "KITCHEN_STAFF" }],
    });
    database.user.findUnique.mockResolvedValue({ identitySyncPending: false });
    auth.getUser.mockResolvedValue({
      disabled: false,
      email: "demo@example.test",
    });
    auth.revokeRefreshTokens.mockResolvedValue(undefined);
    auth.setCustomUserClaims.mockResolvedValue(undefined);
  });
  it("sets claims only from current PostgreSQL role/security version", async () => {
    await synchronizeStaffIdentity("user", "org");
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("demo-uid", {
      role: "KITCHEN_STAFF",
      organizationId: "org",
      authorizationVersion: 3,
    });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith("demo-uid");
    expect(database.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ authorizationVersion: 3 }),
        data: { identitySyncPending: false, identitySyncErrorCode: null },
      }),
    );
  });
  it("uses a durable lease rather than concurrent network writes", async () => {
    database.user.updateMany.mockResolvedValueOnce({ count: 0 });
    database.user.findUnique.mockResolvedValue({ identitySyncPending: true });
    await expect(synchronizeStaffIdentity("user", "org")).resolves.toEqual({
      pending: true,
    });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
  it("preserves pending state and persists only a safe error code after provider failure", async () => {
    auth.setCustomUserClaims.mockRejectedValue(
      new Error("provider secret content"),
    );
    database.user.findUnique.mockResolvedValue({ identitySyncPending: true });
    await expect(synchronizeStaffIdentity("user", "org")).resolves.toEqual({
      pending: true,
    });
    const writes = JSON.stringify(database.user.updateMany.mock.calls);
    expect(writes).toContain("IDENTITY_SYNC_UNAVAILABLE");
    expect(writes).not.toContain("provider secret content");
    expect(writes).not.toContain('"active":true');
    expect(database.user.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { identitySyncLease: null, identitySyncLeaseUntil: null },
      }),
    );
  });
  it("does not sync or reassign shared/foreign identities", async () => {
    database.user.findUniqueOrThrow.mockResolvedValue({
      firebaseUid: "demo-uid",
      email: "demo@example.test",
      authorizationVersion: 3,
      memberships: [{ organizationId: "foreign", role: "CINEMA_ADMIN" }],
    });
    await synchronizeStaffIdentity("user", "org");
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
  it("never enables a Firebase-disabled identity", async () => {
    auth.getUser.mockResolvedValue({
      disabled: true,
      email: "demo@example.test",
    });
    await synchronizeStaffIdentity("user", "org");
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
});
