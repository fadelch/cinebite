import "server-only";

import { randomUUID } from "node:crypto";

import { getCurrentUser } from "@/server/auth/current-user";
import {
  createInventoryItemRecord,
  listActiveInventoryItemsRecord,
  listInventoryItemsRecord,
  updateInventoryItemRecord,
} from "@/server/repositories/inventory-items.repository";
import { listInventoryMovementsRecord } from "@/server/repositories/inventory-movements.repository";
import {
  configureLocationInventoryRecord,
  getLocationInventoryRecord,
  listInventoryLocationsRecord,
  updateInventoryThresholdRecord,
} from "@/server/repositories/location-inventory.repository";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";
import {
  configureLocationInventorySchema,
  inventoryItemInputSchema,
  inventoryItemListQuerySchema,
  inventoryItemUpdateSchema,
  inventoryMovementListQuerySchema,
  updateInventoryThresholdSchema,
} from "@/validation/inventory";
import { documentIdSchema } from "@/validation/shared";

export type InventoryActor = AuthenticatedUser & {
  organizationId: string;
  role: "CINEMA_ADMIN" | "LOCATION_MANAGER";
};

export function requireInventoryActor(actor: AuthenticatedUser | null): InventoryActor {
  if (!actor) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  if (!actor.active || (actor.role !== "CINEMA_ADMIN" && actor.role !== "LOCATION_MANAGER")) {
    throw new ServiceError("AUTHORIZATION_DENIED", 403, "Inventory administration access is not permitted.");
  }
  if (!actor.organizationId) throw new ServiceError("TENANT_CONTEXT_MISSING", 403, "Your account is not assigned to an organization.");
  return actor as InventoryActor;
}

export function requireInventoryCatalogEditor(actor: InventoryActor) {
  if (actor.role !== "CINEMA_ADMIN") {
    throw new ServiceError("AUTHORIZATION_DENIED", 403, "Only Cinema Administrators can change inventory item definitions or recipes.");
  }
}

export function inventoryPermittedLocationIds(actor: InventoryActor): readonly string[] | null {
  return actor.role === "CINEMA_ADMIN" || actor.allLocations ? null : actor.locationIds;
}

export function assertInventoryLocationAccess(actor: InventoryActor, locationId: string) {
  if (actor.role === "LOCATION_MANAGER" && !actor.allLocations && !actor.locationIds.includes(locationId)) {
    throw new ServiceError("LOCATION_ACCESS_DENIED", 403, "You do not have access to this location.");
  }
}

export async function getInventoryContext() {
  const actor = requireInventoryActor(await getCurrentUser());
  const organization = await getOrganizationById(actor.organizationId);
  if (!organization || organization.status !== "ACTIVE") {
    throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 403, "This organization is not active.");
  }
  return { actor, organization };
}

export async function getInventoryWorkspace() {
  const { actor, organization } = await getInventoryContext();
  const [locations, items] = await Promise.all([
    listInventoryLocationsRecord(organization.id, inventoryPermittedLocationIds(actor)),
    listActiveInventoryItemsRecord(organization.id),
  ]);
  return { actor, organization, locations, items };
}

export async function getInventoryOverview(locationIdInput?: string) {
  const { actor, organization } = await getInventoryContext();
  const permittedIds = inventoryPermittedLocationIds(actor);
  const locations = await listInventoryLocationsRecord(organization.id, permittedIds);
  const selectedLocationId = locationIdInput ? documentIdSchema.parse(locationIdInput) : locations[0]?.id;
  if (!selectedLocationId) return { locations, selectedLocationId: null, inventory: [], movements: [], total: 0, lowStock: 0, outOfStock: 0 };
  assertInventoryLocationAccess(actor, selectedLocationId);
  if (!locations.some((location) => location.id === selectedLocationId)) {
    throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
  }
  const [detail, history] = await Promise.all([
    getLocationInventoryRecord(organization.id, selectedLocationId),
    listInventoryMovementsRecord(organization.id, permittedIds, inventoryMovementListQuerySchema.parse({ locationId: selectedLocationId, pageSize: 8 })),
  ]);
  return {
    locations, selectedLocationId, inventory: detail.inventory, movements: history.movements,
    total: detail.inventory.length,
    lowStock: detail.inventory.filter((item) => item.stockStatus === "LOW_STOCK").length,
    outOfStock: detail.inventory.filter((item) => item.stockStatus === "OUT_OF_STOCK").length,
  };
}

export async function getInventoryItems(queryInput: unknown) {
  const { organization } = await getInventoryContext();
  return listInventoryItemsRecord(organization.id, inventoryItemListQuerySchema.parse(queryInput));
}

export async function createInventoryItem(input: unknown) {
  const { actor, organization } = await getInventoryContext();
  requireInventoryCatalogEditor(actor);
  return createInventoryItemRecord(actor.uid, organization.id, randomUUID(), inventoryItemInputSchema.parse(input));
}

export async function updateInventoryItem(itemIdInput: string, input: unknown) {
  const { actor, organization } = await getInventoryContext();
  requireInventoryCatalogEditor(actor);
  return updateInventoryItemRecord(actor.uid, organization.id, documentIdSchema.parse(itemIdInput), inventoryItemUpdateSchema.parse(input));
}

export async function getLocationInventory(locationIdInput: string) {
  const { actor, organization } = await getInventoryContext();
  const locationId = documentIdSchema.parse(locationIdInput);
  assertInventoryLocationAccess(actor, locationId);
  const detail = await getLocationInventoryRecord(organization.id, locationId);
  return { ...detail, canEditCatalog: actor.role === "CINEMA_ADMIN" };
}

export async function configureLocationInventory(locationIdInput: string, input: unknown) {
  const { actor, organization } = await getInventoryContext();
  const locationId = documentIdSchema.parse(locationIdInput);
  assertInventoryLocationAccess(actor, locationId);
  const validated = configureLocationInventorySchema.parse(input);
  return configureLocationInventoryRecord({
    actorUid: actor.uid, organizationId: organization.id, locationId, id: randomUUID(), ...validated,
  });
}

export async function updateInventoryThreshold(locationIdInput: string, locationInventoryIdInput: string, input: unknown) {
  const { actor, organization } = await getInventoryContext();
  const locationId = documentIdSchema.parse(locationIdInput);
  assertInventoryLocationAccess(actor, locationId);
  const { lowStockThreshold } = updateInventoryThresholdSchema.parse(input);
  return updateInventoryThresholdRecord({
    actorUid: actor.uid, organizationId: organization.id, locationId,
    locationInventoryId: documentIdSchema.parse(locationInventoryIdInput), lowStockThreshold,
  });
}

export async function getInventoryMovements(queryInput: unknown) {
  const { actor, organization } = await getInventoryContext();
  const query = inventoryMovementListQuerySchema.parse(queryInput);
  if (query.locationId) assertInventoryLocationAccess(actor, query.locationId);
  return listInventoryMovementsRecord(organization.id, inventoryPermittedLocationIds(actor), query);
}
