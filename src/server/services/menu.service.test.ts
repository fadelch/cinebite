import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/repositories/organizations.repository", () => ({ getOrganizationById: vi.fn() }));
vi.mock("@/server/repositories/menu.repository", () => ({
  createMenuCategoryRecord: vi.fn(), createMenuProductRecord: vi.fn(), getMenuForLocationRecord: vi.fn(),
  getMenuOverviewRecord: vi.fn(), getMenuProduct: vi.fn(), getProductImageRecord: vi.fn(),
  listMenuCategories: vi.fn(), listMenuLocations: vi.fn(), listMenuProducts: vi.fn(),
  setProductImageRecord: vi.fn(), updateMenuCategoryRecord: vi.fn(), updateMenuProductRecord: vi.fn(),
  upsertProductLocationRecord: vi.fn(),
}));
vi.mock("@/server/media/product-image", () => ({ storeProductImage: vi.fn(), deleteProductImage: vi.fn() }));

import { getCurrentUser } from "@/server/auth/current-user";
import { deleteProductImage, storeProductImage } from "@/server/media/product-image";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import { getProductImageRecord, setProductImageRecord, upsertProductLocationRecord } from "@/server/repositories/menu.repository";
import { assertMenuLocationAccess, createMenuCategory, removeMenuProductImage, replaceMenuProductImage, requireCatalogEditor, requireMenuActor, updateMenuProductLocation } from "@/server/services/menu.service";
import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";

const admin: AuthenticatedUser = { uid: "admin", email: "admin@example.com", displayName: "Admin", role: "CINEMA_ADMIN", organizationId: "org-1", locationIds: [], allLocations: true, active: true };
const manager: AuthenticatedUser = { ...admin, uid: "manager", role: "LOCATION_MANAGER", locationIds: ["loc-1"], allLocations: false };

describe("Phase 7 menu authorization and media coordination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrganizationById).mockResolvedValue({ id: "org-1", status: "ACTIVE" } as never);
    vi.mocked(deleteProductImage).mockResolvedValue(undefined);
  });

  it("allows Cinema Admin catalog editing and rejects Location Manager editing", () => {
    expect(() => requireCatalogEditor(requireMenuActor(admin))).not.toThrow();
    expect(() => requireCatalogEditor(requireMenuActor(manager))).toThrowError(ServiceError);
  });

  it("rejects staff and unauthenticated menu actors", () => {
    expect(() => requireMenuActor(null)).toThrowError(ServiceError);
    expect(() => requireMenuActor({ ...manager, role: "KITCHEN_STAFF" })).toThrowError(ServiceError);
  });

  it("enforces a Location Manager's explicit location boundary", () => {
    expect(() => assertMenuLocationAccess(requireMenuActor(manager), "loc-1")).not.toThrow();
    expect(() => assertMenuLocationAccess(requireMenuActor(manager), "loc-2")).toThrowError(ServiceError);
  });

  it("prevents Location Manager category creation before a repository write", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager);
    await expect(createMenuCategory({ name: "Popcorn", slug: "popcorn" })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("allows an authorized manager to update exact price and availability", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager);
    vi.mocked(upsertProductLocationRecord).mockResolvedValue({ id: "offer-1" } as never);
    await updateMenuProductLocation("product-1", "loc-1", { price: "5.5", currencyCode: "usd", isAvailable: false });
    expect(upsertProductLocationRecord).toHaveBeenCalledWith("manager", "org-1", "product-1", "loc-1", { price: "5.50", currencyCode: "USD", isAvailable: false });
  });

  it("blocks an unauthorized location before the database mutation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager);
    await expect(updateMenuProductLocation("product-1", "loc-2", { price: "5", currencyCode: "USD", isAvailable: true })).rejects.toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
    expect(upsertProductLocationRecord).not.toHaveBeenCalled();
  });

  it("uploads replacement first, updates PostgreSQL, then deletes the old object", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(getProductImageRecord).mockResolvedValue({ id: "product-1", imageStoragePath: "old.webp", imageUrl: "old" });
    vi.mocked(storeProductImage).mockResolvedValue({ storagePath: "new.webp", url: "new-url" });
    vi.mocked(setProductImageRecord).mockResolvedValue({ oldPath: "old.webp", product: {} as never });
    await expect(replaceMenuProductImage("product-1", new File(["image"], "image.png"))).resolves.toEqual({ imageUrl: "new-url" });
    expect(setProductImageRecord).toHaveBeenCalledWith("admin", "org-1", "product-1", { storagePath: "new.webp", url: "new-url" });
    expect(deleteProductImage).toHaveBeenCalledWith("org-1", "product-1", "old.webp");
  });

  it("compensates by deleting a new upload when the database update fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(getProductImageRecord).mockResolvedValue({ id: "product-1", imageStoragePath: "old.webp", imageUrl: "old" });
    vi.mocked(storeProductImage).mockResolvedValue({ storagePath: "new.webp", url: "new-url" });
    vi.mocked(setProductImageRecord).mockRejectedValue(new Error("db failed"));
    await expect(replaceMenuProductImage("product-1", new File(["image"], "image.png"))).rejects.toThrow("db failed");
    expect(deleteProductImage).toHaveBeenCalledWith("org-1", "product-1", "new.webp");
  });

  it("clears PostgreSQL before deleting a removed image", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(getProductImageRecord).mockResolvedValue({ id: "product-1", imageStoragePath: "old.webp", imageUrl: "old" });
    vi.mocked(setProductImageRecord).mockResolvedValue({ oldPath: "old.webp", product: {} as never });
    await removeMenuProductImage("product-1");
    expect(setProductImageRecord).toHaveBeenCalledWith("admin", "org-1", "product-1", null);
    expect(deleteProductImage).toHaveBeenCalledWith("org-1", "product-1", "old.webp");
  });
});
