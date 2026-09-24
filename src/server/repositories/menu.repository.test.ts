import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({ prismaMock: {
  user: { findUnique: vi.fn() },
  menuCategory: { findMany: vi.fn() },
  product: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  location: { findFirst: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
} }));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { createMenuCategoryRecord, getMenuForLocationRecord, listMenuCategories, listMenuProducts, upsertProductLocationRecord } from "@/server/repositories/menu.repository";

describe("menu repository tenant and availability queries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always scopes category listings to the trusted organization", async () => {
    prismaMock.menuCategory.findMany.mockResolvedValue([]);
    await listMenuCategories("org-1");
    expect(prismaMock.menuCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1" } }));
  });

  it("bounds product queries and hides unauthorized location configuration", async () => {
    prismaMock.product.findMany.mockReturnValue("find-query");
    prismaMock.product.count.mockReturnValue("count-query");
    prismaMock.$transaction.mockResolvedValue([[], 0]);
    await listMenuProducts({ organizationId: "org-1", permittedIds: ["loc-1"], search: "pop", page: 2, pageSize: 24 });
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org-1", name: { contains: "pop", mode: "insensitive" } }),
      skip: 24,
      take: 24,
      include: expect.objectContaining({ productLocations: expect.objectContaining({ where: { locationId: { in: ["loc-1"] } } }) }),
    }));
  });

  it("future location menu requires active category/product and optionally available offer", async () => {
    prismaMock.location.findFirst.mockResolvedValue({ id: "loc-1", name: "Achrafieh" });
    prismaMock.menuCategory.findMany.mockResolvedValue([]);
    await getMenuForLocationRecord("org-1", "loc-1", true);
    expect(prismaMock.location.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "loc-1", organizationId: "org-1", status: "ACTIVE" } }));
    expect(prismaMock.menuCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org-1", status: "ACTIVE", products: { some: { status: "ACTIVE", productLocations: { some: { locationId: "loc-1", isAvailable: true } } } } }),
    }));
  });

  it("commits category creation and its audit event in one transaction", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });
    const tx = {
      menuCategory: { create: vi.fn().mockResolvedValue({ id: "cat-1", name: "Popcorn", slug: "popcorn", description: null, status: "ACTIVE", sortOrder: 0, _count: { products: 0 } }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(async (operation: unknown) => (operation as (client: typeof tx) => unknown)(tx));
    await createMenuCategoryRecord("firebase-1", "org-1", "cat-1", { name: "Popcorn", slug: "popcorn", description: null, status: "ACTIVE", sortOrder: 0 });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "CATEGORY_CREATED", entityType: "MENU_CATEGORY", entityId: "cat-1", organizationId: "org-1" }) });
  });

  it("audits price and availability transitions without floating-point conversion", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });
    const tx = {
      product: { findFirst: vi.fn().mockResolvedValue({ id: "product-1" }) },
      location: { findFirst: vi.fn().mockResolvedValue({ id: "loc-1" }) },
      productLocation: {
        findUnique: vi.fn().mockResolvedValue({ price: { toFixed: () => "4.00" }, currencyCode: "USD", isAvailable: true }),
        upsert: vi.fn().mockResolvedValue({ id: "offer-1", locationId: "loc-1", price: { toFixed: () => "5.50" }, currencyCode: "USD", isAvailable: false, location: { name: "Achrafieh" } }),
      },
      auditLog: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    prismaMock.$transaction.mockImplementation(async (operation: unknown) => (operation as (client: typeof tx) => unknown)(tx));
    await upsertProductLocationRecord("firebase-1", "org-1", "product-1", "loc-1", { price: "5.50", currencyCode: "USD", isAvailable: false });
    const auditRows = tx.auditLog.createMany.mock.calls[0]![0].data;
    expect(auditRows.map((row: { action: string }) => row.action)).toEqual(["PRODUCT_LOCATION_PRICE_CHANGED", "PRODUCT_LOCATION_AVAILABILITY_CHANGED"]);
    expect(auditRows[0].metadata).toMatchObject({ previousPrice: "4.00", price: "5.50" });
  });
});
