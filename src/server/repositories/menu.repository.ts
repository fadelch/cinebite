import "server-only";

import { isPrismaError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { ServiceError } from "@/server/services/service-error";
import type { MenuCategoryDto, ProductDto } from "@/types/menu";
import type {
  menuCategoryInputSchema,
  menuCategoryUpdateSchema,
  productCreateSchema,
  productLocationUpdateSchema,
  productUpdateSchema,
} from "@/validation/menu";

type CategoryInput = ReturnType<typeof menuCategoryInputSchema.parse>;
type CategoryUpdate = ReturnType<typeof menuCategoryUpdateSchema.parse>;
type ProductInput = ReturnType<typeof productCreateSchema.parse>;
type ProductUpdate = ReturnType<typeof productUpdateSchema.parse>;
type ProductLocationInput = ReturnType<typeof productLocationUpdateSchema.parse>;

const productInclude = {
  category: { select: { name: true } },
  productLocations: {
    include: { location: { select: { name: true } } },
    orderBy: { location: { name: "asc" as const } },
  },
} as const;

function categoryDto(row: {
  id: string; name: string; slug: string; description: string | null;
  status: "ACTIVE" | "INACTIVE"; sortOrder: number; _count: { products: number };
}): MenuCategoryDto {
  const { _count, ...category } = row;
  return { ...category, productCount: _count.products };
}

function productDto(row: {
  id: string; categoryId: string; name: string; slug: string; description: string;
  sku: string | null; imageUrl: string | null; status: "ACTIVE" | "INACTIVE";
  sortOrder: number; updatedAt: Date; category: { name: string };
  productLocations: Array<{ id: string; locationId: string; price: { toFixed(value: number): string };
    currencyCode: string; isAvailable: boolean; location: { name: string } }>;
}): ProductDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sku: row.sku,
    imageUrl: row.imageUrl,
    status: row.status,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
    locations: row.productLocations.map((entry) => ({
      id: entry.id,
      locationId: entry.locationId,
      locationName: entry.location.name,
      price: entry.price.toFixed(2),
      currencyCode: entry.currencyCode,
      isAvailable: entry.isAvailable,
    })),
  };
}

async function actorUserId(firebaseUid: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { firebaseUid }, select: { id: true } });
  if (!user) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  return user.id;
}

function mapUniqueError(error: unknown, entity: "category" | "product" | "offer"): never {
  if (isPrismaError(error, "P2002")) {
    const target = typeof error === "object" && error && "meta" in error
      ? JSON.stringify(error.meta) : "";
    if (target.includes("sku")) throw new ServiceError("DUPLICATE_PRODUCT_SKU", 409, "This SKU is already used by another product.");
    if (target.includes("productId") && target.includes("locationId")) throw new ServiceError("PRODUCT_LOCATION_CONFLICT", 409, "This product is already assigned to that location.");
    if (entity === "offer") throw new ServiceError("PRODUCT_LOCATION_CONFLICT", 409, "This product is already assigned to that location.");
    if (entity === "product") throw new ServiceError("DUPLICATE_PRODUCT_SLUG", 409, "This product slug is already in use.");
    throw new ServiceError("DUPLICATE_CATEGORY_SLUG", 409, "This category slug is already in use.");
  }
  throw error;
}

export async function listMenuCategories(organizationId: string): Promise<MenuCategoryDto[]> {
  const rows = await prisma.menuCategory.findMany({
    where: { organizationId },
    include: { _count: { select: { products: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(categoryDto);
}

export async function listMenuLocations(organizationId: string, permittedIds: readonly string[] | null) {
  if (permittedIds !== null && permittedIds.length === 0) return [];
  return prisma.location.findMany({
    where: { organizationId, ...(permittedIds === null ? {} : { id: { in: [...permittedIds] } }) },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
}

export async function listMenuProducts(input: {
  organizationId: string; permittedIds: readonly string[] | null; search: string;
  categoryId?: string; status?: "ACTIVE" | "INACTIVE"; locationId?: string;
  availability?: "AVAILABLE" | "UNAVAILABLE";
  page: number; pageSize: number;
}) {
  const where = {
    organizationId: input.organizationId,
    ...(input.search ? { name: { contains: input.search, mode: "insensitive" as const } } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.locationId || input.availability ? { productLocations: { some: {
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.availability ? { isAvailable: input.availability === "AVAILABLE" } : {}),
    } } } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: {
        category: productInclude.category,
        productLocations: {
          where: input.permittedIds === null ? {} : { locationId: { in: [...input.permittedIds] } },
          include: { location: { select: { name: true } } },
          orderBy: { location: { name: "asc" } },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return { products: rows.map(productDto), total };
}

export async function getMenuProduct(organizationId: string, productId: string, permittedIds: readonly string[] | null) {
  const row = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    include: {
      category: productInclude.category,
      productLocations: {
        where: permittedIds === null ? {} : { locationId: { in: [...permittedIds] } },
        include: { location: { select: { name: true } } },
        orderBy: { location: { name: "asc" } },
      },
    },
  });
  return row ? productDto(row) : null;
}

export async function getProductImageRecord(organizationId: string, productId: string) {
  return prisma.product.findFirst({ where: { id: productId, organizationId }, select: { id: true, imageStoragePath: true, imageUrl: true } });
}

export async function createMenuCategoryRecord(actorUid: string, organizationId: string, id: string, input: CategoryInput) {
  const actorId = await actorUserId(actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.menuCategory.create({ data: { id, organizationId, ...input }, include: { _count: { select: { products: true } } } });
      await tx.auditLog.create({ data: { actorUserId: actorId, action: "CATEGORY_CREATED", entityType: "MENU_CATEGORY", entityId: id, organizationId, metadata: { slug: input.slug } } });
      return created;
    });
    return categoryDto(row);
  } catch (error) { mapUniqueError(error, "category"); }
}

export async function updateMenuCategoryRecord(actorUid: string, organizationId: string, id: string, input: CategoryUpdate) {
  const actorId = await actorUserId(actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.menuCategory.findFirst({ where: { id, organizationId } });
      if (!existing) throw new ServiceError("CATEGORY_NOT_FOUND", 404, "Menu category not found.");
      const updated = await tx.menuCategory.update({ where: { id }, data: input, include: { _count: { select: { products: true } } } });
      const action = input.status && input.status !== existing.status
        ? input.status === "ACTIVE" ? "CATEGORY_ENABLED" : "CATEGORY_DISABLED"
        : "CATEGORY_UPDATED";
      await tx.auditLog.create({ data: { actorUserId: actorId, action, entityType: "MENU_CATEGORY", entityId: id, organizationId, metadata: { changedFields: Object.keys(input) } } });
      return updated;
    });
    return categoryDto(row);
  } catch (error) { mapUniqueError(error, "category"); }
}

export async function createMenuProductRecord(actorUid: string, organizationId: string, id: string, input: ProductInput, image?: { storagePath: string; url: string }) {
  const actorId = await actorUserId(actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const category = await tx.menuCategory.findFirst({ where: { id: input.categoryId, organizationId } });
      if (!category) throw new ServiceError("CATEGORY_NOT_FOUND", 404, "Menu category not found.");
      const locationIds = input.locations.map((entry) => entry.locationId);
      const locationCount = await tx.location.count({ where: { organizationId, id: { in: locationIds } } });
      if (locationCount !== new Set(locationIds).size) throw new ServiceError("LOCATION_NOT_FOUND", 404, "One or more selected locations were not found.");
      const created = await tx.product.create({
        data: {
          id, organizationId, categoryId: input.categoryId, name: input.name, slug: input.slug,
          description: input.description, sku: input.sku, status: input.status, sortOrder: input.sortOrder,
          imageStoragePath: image?.storagePath, imageUrl: image?.url,
          productLocations: { create: input.locations.map((entry) => ({ organizationId, ...entry })) },
        },
        include: productInclude,
      });
      await tx.auditLog.createMany({ data: [
        { actorUserId: actorId, action: "PRODUCT_CREATED", entityType: "PRODUCT", entityId: id, organizationId, metadata: { slug: input.slug, assignedLocations: input.locations.length } },
        ...input.locations.map((entry) => ({ actorUserId: actorId, action: "PRODUCT_LOCATION_ASSIGNED" as const, entityType: "PRODUCT_LOCATION" as const, entityId: id, organizationId, locationId: entry.locationId, metadata: { productId: id, currencyCode: entry.currencyCode, isAvailable: entry.isAvailable } })),
      ] });
      return created;
    });
    return productDto(row);
  } catch (error) { mapUniqueError(error, "product"); }
}

export async function updateMenuProductRecord(actorUid: string, organizationId: string, id: string, input: ProductUpdate) {
  const actorId = await actorUserId(actorUid);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({ where: { id, organizationId } });
      if (!existing) throw new ServiceError("PRODUCT_NOT_FOUND", 404, "Product not found.");
      if (input.categoryId) {
        const category = await tx.menuCategory.findFirst({ where: { id: input.categoryId, organizationId } });
        if (!category) throw new ServiceError("CATEGORY_NOT_FOUND", 404, "Menu category not found.");
      }
      const updated = await tx.product.update({ where: { id }, data: input, include: productInclude });
      const action = input.status && input.status !== existing.status
        ? input.status === "ACTIVE" ? "PRODUCT_ENABLED" : "PRODUCT_DISABLED"
        : "PRODUCT_UPDATED";
      await tx.auditLog.create({ data: { actorUserId: actorId, action, entityType: "PRODUCT", entityId: id, organizationId, metadata: { changedFields: Object.keys(input) } } });
      return updated;
    });
    return productDto(row);
  } catch (error) { mapUniqueError(error, "product"); }
}

export async function upsertProductLocationRecord(actorUid: string, organizationId: string, productId: string, locationId: string, input: ProductLocationInput) {
  const actorId = await actorUserId(actorUid);
  return prisma.$transaction(async (tx) => {
    const [product, location, existing] = await Promise.all([
      tx.product.findFirst({ where: { id: productId, organizationId } }),
      tx.location.findFirst({ where: { id: locationId, organizationId } }),
      tx.productLocation.findUnique({ where: { productId_locationId: { productId, locationId } } }),
    ]);
    if (!product) throw new ServiceError("PRODUCT_NOT_FOUND", 404, "Product not found.");
    if (!location) throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
    const record = await tx.productLocation.upsert({
      where: { productId_locationId: { productId, locationId } },
      create: { productId, locationId, organizationId, ...input },
      update: input,
      include: { location: { select: { name: true } } },
    });
    const events = !existing ? ["PRODUCT_LOCATION_ASSIGNED" as const] : [
      ...(existing.price.toFixed(2) !== input.price || existing.currencyCode !== input.currencyCode ? ["PRODUCT_LOCATION_PRICE_CHANGED" as const] : []),
      ...(existing.isAvailable !== input.isAvailable ? ["PRODUCT_LOCATION_AVAILABILITY_CHANGED" as const] : []),
    ];
    if (events.length) await tx.auditLog.createMany({ data: events.map((action) => ({
      actorUserId: actorId,
      action,
      entityType: "PRODUCT_LOCATION",
      entityId: record.id,
      organizationId,
      locationId,
      metadata: action === "PRODUCT_LOCATION_PRICE_CHANGED"
        ? { productId, previousPrice: existing?.price.toFixed(2) ?? null, price: input.price, previousCurrencyCode: existing?.currencyCode ?? null, currencyCode: input.currencyCode }
        : action === "PRODUCT_LOCATION_AVAILABILITY_CHANGED"
          ? { productId, previousAvailability: existing?.isAvailable ?? null, isAvailable: input.isAvailable }
          : { productId, price: input.price, currencyCode: input.currencyCode, isAvailable: input.isAvailable },
    })) });
    return { id: record.id, locationId, locationName: record.location.name, price: record.price.toFixed(2), currencyCode: record.currencyCode, isAvailable: record.isAvailable };
  });
}

export async function setProductImageRecord(actorUid: string, organizationId: string, productId: string, image: { storagePath: string; url: string } | null) {
  const actorId = await actorUserId(actorUid);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findFirst({ where: { id: productId, organizationId } });
    if (!existing) throw new ServiceError("PRODUCT_NOT_FOUND", 404, "Product not found.");
    const updated = await tx.product.update({ where: { id: productId }, data: { imageStoragePath: image?.storagePath ?? null, imageUrl: image?.url ?? null } });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: image ? "PRODUCT_IMAGE_UPDATED" : "PRODUCT_IMAGE_REMOVED", entityType: "PRODUCT", entityId: productId, organizationId, metadata: { hadPreviousImage: Boolean(existing.imageStoragePath) } } });
    return { oldPath: existing.imageStoragePath, product: updated };
  });
}

export async function getMenuForLocationRecord(organizationId: string, locationId: string, availableOnly: boolean) {
  const location = await prisma.location.findFirst({ where: { id: locationId, organizationId, status: "ACTIVE" }, select: { id: true, name: true } });
  if (!location) throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
  const categories = await prisma.menuCategory.findMany({
    where: { organizationId, status: "ACTIVE", products: { some: { status: "ACTIVE", productLocations: { some: { locationId, ...(availableOnly ? { isAvailable: true } : {}) } } } } },
    select: { id: true, name: true, slug: true, sortOrder: true, products: {
      where: { status: "ACTIVE", productLocations: { some: { locationId, ...(availableOnly ? { isAvailable: true } : {}) } } },
      select: { id: true, name: true, slug: true, description: true, imageUrl: true, sortOrder: true, productLocations: { where: { locationId }, select: { price: true, currencyCode: true, isAvailable: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return { location, categories: categories.map((category) => ({ ...category, products: category.products.map((product) => ({ ...product, price: product.productLocations[0]!.price.toFixed(2), currencyCode: product.productLocations[0]!.currencyCode, isAvailable: product.productLocations[0]!.isAvailable, productLocations: undefined })) })) };
}

export async function getMenuOverviewRecord(organizationId: string, permittedIds: readonly string[] | null) {
  const [categoryCount, productCount, activeProductCount, recent] = await Promise.all([
    prisma.menuCategory.count({ where: { organizationId } }),
    prisma.product.count({ where: { organizationId } }),
    prisma.product.count({ where: { organizationId, status: "ACTIVE" } }),
    listMenuProducts({ organizationId, permittedIds, search: "", page: 1, pageSize: 5 }),
  ]);
  const partiallyUnavailableCount = await prisma.product.count({ where: { organizationId, status: "ACTIVE", productLocations: { some: { isAvailable: false, ...(permittedIds === null ? {} : { locationId: { in: [...permittedIds] } }) } } } });
  return { categoryCount, productCount, activeProductCount, inactiveProductCount: productCount - activeProductCount, partiallyUnavailableCount, recentProducts: recent.products };
}
