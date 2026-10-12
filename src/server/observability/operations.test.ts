import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
import { getCurrentUser } from "@/server/auth/current-user";
import { requireOperationsActor } from "./operations";
describe("platform operations authorization", () => {
  it("requires staff auth and never treats request ID as identity", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(requireOperationsActor()).rejects.toMatchObject({
      status: 401,
    });
  });
  it.each([
    "CINEMA_ADMIN",
    "LOCATION_MANAGER",
    "KITCHEN_STAFF",
    "DELIVERY_STAFF",
  ])("denies %s platform-wide data", async (role) => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      role,
      active: true,
    } as never);
    await expect(requireOperationsActor()).rejects.toMatchObject({
      status: 403,
    });
  });
  it("permits verified active platform admin only", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      role: "SUPER_ADMIN",
      active: true,
    } as never);
    await expect(requireOperationsActor()).resolves.toMatchObject({
      role: "SUPER_ADMIN",
    });
  });
});
