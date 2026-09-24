import "server-only";

import { randomUUID } from "node:crypto";

import { deleteProductImage, storeProductImage } from "@/server/media/product-image";
import { getCurrentUser } from "@/server/auth/current-user";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import {
  createMenuCategoryRecord,
  createMenuProductRecord,
  getMenuForLocationRecord,
  getMenuOverviewRecord,
  getMenuProduct,
  getProductImageRecord,
  listMenuCategories,
  listMenuLocations,
  listMenuProducts,
  setProductImageRecord,
  updateMenuCategoryRecord,
  updateMenuProductRecord,
  upsertProductLocationRecord,
} from "@/server/repositories/menu.repository";
import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";
import {
  menuCategoryInputSchema,
  menuCategoryUpdateSchema,
  productCreateSchema,
  productListQuerySchema,
  productLocationUpdateSchema,
  productUpdateSchema,
} from "@/validation/menu";
import { documentIdSchema } from "@/validation/shared";

export type MenuActor = AuthenticatedUser & {
  organizationId: string;
  role: "CINEMA_ADMIN" | "LOCATION_MANAGER";
};

export function requireMenuActor(actor: AuthenticatedUser | null): MenuActor {
  if (!actor) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  if (!actor.active || (actor.role !== "CINEMA_ADMIN" && actor.role !== "LOCATION_MANAGER")) {
    throw new ServiceError("AUTHORIZATION_DENIED", 403, "Menu administration access is not permitted.");
  }
  if (!actor.organizationId) throw new ServiceError("TENANT_CONTEXT_MISSING", 403, "Your account is not assigned to an organization.");
  return actor as MenuActor;
}

export function requireCatalogEditor(actor: MenuActor) {
  if (actor.role !== "CINEMA_ADMIN") {
    throw new ServiceError("AUTHORIZATION_DENIED", 403, "Only Cinema Administrators can change the organization catalog.");
  }
}

export function menuPermittedLocationIds(actor: MenuActor): readonly string[] | null {
  return actor.role === "CINEMA_ADMIN" || actor.allLocations ? null : actor.locationIds;
}

export function assertMenuLocationAccess(actor: MenuActor, locationId: string) {
  if (actor.role === "LOCATION_MANAGER" && !actor.allLocations && !actor.locationIds.includes(locationId)) {
    throw new ServiceError("LOCATION_ACCESS_DENIED", 403, "You do not have access to this location.");
  }
}

async function context() {
  const actor = requireMenuActor(await getCurrentUser());
  const organization = await getOrganizationById(actor.organizationId);
  if (!organization || organization.status !== "ACTIVE") {
    throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 403, "This organization is not active.");
  }
  return { actor, organization };
}

export async function getMenuWorkspaceData() {
  const { actor, organization } = await context();
  const permitted = menuPermittedLocationIds(actor);
  const [categories, locations] = await Promise.all([
    listMenuCategories(organization.id),
    listMenuLocations(organization.id, permitted),
  ]);
  return { actor, organization, categories, locations };
}

export async function getMenuOverview() {
  const { actor, organization } = await context();
  return getMenuOverviewRecord(organization.id, menuPermittedLocationIds(actor));
}

export async function getCategoriesForMenu() {
  const { organization } = await context();
  return listMenuCategories(organization.id);
}

export async function createMenuCategory(input: unknown) {
  const { actor, organization } = await context();
  requireCatalogEditor(actor);
  return createMenuCategoryRecord(actor.uid, organization.id, randomUUID(), menuCategoryInputSchema.parse(input));
}

export async function updateMenuCategory(categoryIdInput: string, input: unknown) {
  const { actor, organization } = await context();
  requireCatalogEditor(actor);
  const categoryId = documentIdSchema.parse(categoryIdInput);
  return updateMenuCategoryRecord(actor.uid, organization.id, categoryId, menuCategoryUpdateSchema.parse(input));
}

export async function getProductsForMenu(queryInput: unknown) {
  const { actor, organization } = await context();
  const query = productListQuerySchema.parse(queryInput);
  if (query.locationId) assertMenuLocationAccess(actor, query.locationId);
  return listMenuProducts({ organizationId: organization.id, permittedIds: menuPermittedLocationIds(actor), ...query });
}

export async function getProductForMenu(productIdInput: string) {
  const { actor, organization } = await context();
  const productId = documentIdSchema.parse(productIdInput);
  const product = await getMenuProduct(organization.id, productId, menuPermittedLocationIds(actor));
  if (!product) throw new ServiceError("PRODUCT_NOT_FOUND", 404, "Product not found.");
  return { product, canEditCatalog: actor.role === "CINEMA_ADMIN" };
}

export async function createMenuProduct(input: unknown, imageFile?: File | null) {
  const { actor, organization } = await context();
  requireCatalogEditor(actor);
  const productId = randomUUID();
  const validated = productCreateSchema.parse(input);
  let image: Awaited<ReturnType<typeof storeProductImage>> | undefined;
  try {
    if (imageFile && imageFile.size > 0) image = await storeProductImage(organization.id, productId, imageFile);
    return await createMenuProductRecord(actor.uid, organization.id, productId, validated, image);
  } catch (error) {
    if (image) await deleteProductImage(organization.id, productId, image.storagePath).catch(() => undefined);
    throw error;
  }
}

export async function updateMenuProduct(productIdInput: string, input: unknown) {
  const { actor, organization } = await context();
  requireCatalogEditor(actor);
  const productId = documentIdSchema.parse(productIdInput);
  return updateMenuProductRecord(actor.uid, organization.id, productId, productUpdateSchema.parse(input));
}

export async function updateMenuProductLocation(productIdInput: string, locationIdInput: string, input: unknown) {
  const { actor, organization } = await context();
  const productId = documentIdSchema.parse(productIdInput);
  const locationId = documentIdSchema.parse(locationIdInput);
  assertMenuLocationAccess(actor, locationId);
  return upsertProductLocationRecord(actor.uid, organization.id, productId, locationId, productLocationUpdateSchema.parse(input));
}

export async function replaceMenuProductImage(productIdInput: string, file: File) {
  const { actor, organization } = await context();
  requireCatalogEditor(actor);
  const productId = documentIdSchema.parse(productIdInput);
  const existing = await getProductImageRecord(organization.id, productId);
  if (!existing) throw new ServiceError("PRODUCT_NOT_FOUND", 404, "Product not found.");
  const uploaded = await storeProductImage(organization.id, productId, file);
  try {
    const result = await setProductImageRecord(actor.uid, organization.id, productId, uploaded);
    if (result.oldPath) await deleteProductImage(organization.id, productId, result.oldPath).catch((error: unknown) => {
      console.error("[menu/media] Old image cleanup failed.", { name: error instanceof Error ? error.name : "UnknownError" });
    });
    return { imageUrl: uploaded.url };
  } catch (error) {
    await deleteProductImage(organization.id, productId, uploaded.storagePath).catch(() => undefined);
    throw error;
  }
}

export async function removeMenuProductImage(productIdInput: string) {
  const { actor, organization } = await context();
  requireCatalogEditor(actor);
  const productId = documentIdSchema.parse(productIdInput);
  const existing = await getProductImageRecord(organization.id, productId);
  if (!existing) throw new ServiceError("PRODUCT_NOT_FOUND", 404, "Product not found.");
  const result = await setProductImageRecord(actor.uid, organization.id, productId, null);
  if (result.oldPath) await deleteProductImage(organization.id, productId, result.oldPath).catch((error: unknown) => {
    console.error("[menu/media] Removed image cleanup failed.", { name: error instanceof Error ? error.name : "UnknownError" });
  });
  return { removed: true };
}

export async function getMenuForLocation(locationIdInput: string, availableOnly = true) {
  const { actor, organization } = await context();
  const locationId = documentIdSchema.parse(locationIdInput);
  assertMenuLocationAccess(actor, locationId);
  return getMenuForLocationRecord(organization.id, locationId, availableOnly);
}
