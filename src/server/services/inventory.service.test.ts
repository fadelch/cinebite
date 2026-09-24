import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/repositories/organizations.repository", () => ({ getOrganizationById: vi.fn() }));
vi.mock("@/server/repositories/inventory-items.repository", () => ({
  createInventoryItemRecord: vi.fn(), listActiveInventoryItemsRecord: vi.fn(),
  listInventoryItemsRecord: vi.fn(), updateInventoryItemRecord: vi.fn(),
}));
vi.mock("@/server/repositories/inventory-movements.repository", () => ({ listInventoryMovementsRecord: vi.fn() }));
vi.mock("@/server/repositories/location-inventory.repository", () => ({
  configureLocationInventoryRecord: vi.fn(), getLocationInventoryRecord: vi.fn(),
  listInventoryLocationsRecord: vi.fn(), updateInventoryThresholdRecord: vi.fn(),
}));

import { getCurrentUser } from "@/server/auth/current-user";
import { createInventoryItemRecord } from "@/server/repositories/inventory-items.repository";
import { getLocationInventoryRecord } from "@/server/repositories/location-inventory.repository";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import {
  createInventoryItem,
  getLocationInventory,
  requireInventoryActor,
} from "@/server/services/inventory.service";
import type { AuthenticatedUser } from "@/types/auth";

const admin: AuthenticatedUser = { uid: "admin", email: "admin@example.com", displayName: "Admin", role: "CINEMA_ADMIN", organizationId: "org-1", locationIds: [], allLocations: true, active: true };
const manager: AuthenticatedUser = { ...admin, uid: "manager", role: "LOCATION_MANAGER", locationIds: ["loc-1"], allLocations: false };

describe("inventory service authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrganizationById).mockResolvedValue({ id: "org-1", status: "ACTIVE" } as never);
    vi.mocked(getLocationInventoryRecord).mockResolvedValue({ location: { id: "loc-1" }, inventory: [], availableItems: [] } as never);
  });

  it("allows a Cinema Admin to create a global item in their authenticated organization", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(createInventoryItemRecord).mockResolvedValue({ id: "item-1" } as never);
    await createInventoryItem({ name: "Popcorn kernels", sku: "INV-KERNEL", unit: "GRAM", status: "ACTIVE" });
    expect(createInventoryItemRecord).toHaveBeenCalledWith("admin", "org-1", expect.any(String), expect.objectContaining({ sku: "INV-KERNEL" }));
  });

  it("allows a Location Manager only at an assigned location", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager);
    await expect(getLocationInventory("loc-1")).resolves.toMatchObject({ canEditCatalog: false });
    await expect(getLocationInventory("loc-2")).rejects.toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
    expect(getLocationInventoryRecord).toHaveBeenCalledTimes(1);
  });

  it("prevents a Location Manager from creating organization-wide items", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager);
    await expect(createInventoryItem({ name: "Cups", sku: "INV-CUP", unit: "EACH" })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(createInventoryItemRecord).not.toHaveBeenCalled();
  });

  it("denies kitchen, delivery, inactive, and unauthenticated actors", () => {
    expect(() => requireInventoryActor({ ...manager, role: "KITCHEN_STAFF" })).toThrow();
    expect(() => requireInventoryActor({ ...manager, role: "DELIVERY_STAFF" })).toThrow();
    expect(() => requireInventoryActor({ ...manager, active: false })).toThrow();
    expect(() => requireInventoryActor(null)).toThrow();
  });
});
